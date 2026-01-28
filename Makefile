.PHONY: build clean release release-docker release-brew release-all version-patch version-minor

VERSION := $(shell node -p "require('./package.json').version")

# Clean build artifacts
clean:
	rm -rf dist .next/standalone

# Build the Next.js app
build: clean
	pnpm build

# Package the standalone release
package: build
	node scripts/package-release.js

# Create a new patch release (bump version, build, tag)
release: package
	@echo "Built release v$(VERSION)"
	@echo "Tarball: dist/beads-ui-$(VERSION)-standalone.tar.gz"
	@echo ""
	@echo "To publish:"
	@echo "  make publish"

# Publish to GitHub, Homebrew, and Docker
publish: publish-github publish-brew publish-docker
	@echo ""
	@echo "Released v$(VERSION) to all channels"

# Push to GitHub and create release
publish-github:
	git push && git push --tags
	gh release create v$(VERSION) --title "v$(VERSION)" \
		--notes "Release v$(VERSION)" \
		dist/beads-ui-$(VERSION)-standalone.tar.gz

# Update Homebrew tap
publish-brew:
	@SHA=$$(shasum -a 256 dist/beads-ui-$(VERSION)-standalone.tar.gz | cut -d' ' -f1); \
	cd ~/Desktop/Projects/homebrew-tap && \
	sed -i '' 's/version "[^"]*"/version "$(VERSION)"/' Formula/beads-ui.rb && \
	sed -i '' 's|/v[0-9.]*[0-9]/beads-ui-[0-9.]*[0-9]-standalone|/v$(VERSION)/beads-ui-$(VERSION)-standalone|g' Formula/beads-ui.rb && \
	sed -i '' "s/sha256 \"[^\"]*\"/sha256 \"$$SHA\"/" Formula/beads-ui.rb && \
	git add Formula/beads-ui.rb && \
	git commit -m "beads-ui: update to $(VERSION)" && \
	git push

# Build and push Docker image
publish-docker:
	docker build -t ghcr.io/nmelo/beads-ui:$(VERSION) -t ghcr.io/nmelo/beads-ui:latest .
	docker push ghcr.io/nmelo/beads-ui:$(VERSION)
	docker push ghcr.io/nmelo/beads-ui:latest

# Bump patch version and commit
version-patch:
	npm version patch --no-git-tag-version
	@NEW_VERSION=$$(node -p "require('./package.json').version"); \
	git add package.json && \
	git commit -m "chore: bump version to $$NEW_VERSION" && \
	git tag v$$NEW_VERSION

# Bump minor version and commit
version-minor:
	npm version minor --no-git-tag-version
	@NEW_VERSION=$$(node -p "require('./package.json').version"); \
	git add package.json && \
	git commit -m "chore: bump version to $$NEW_VERSION" && \
	git tag v$$NEW_VERSION

# Full release workflow: bump, build, publish everything
release-all: version-patch release publish
	@echo "Done! Released v$$(node -p \"require('./package.json').version\")"

# Show current version
version:
	@echo $(VERSION)

# Help
help:
	@echo "Beads UI Release Makefile"
	@echo ""
	@echo "Usage:"
	@echo "  make build          - Clean and build"
	@echo "  make release        - Build release tarball"
	@echo "  make publish        - Publish to GitHub, Homebrew, Docker"
	@echo "  make release-all    - Bump version + build + publish (full release)"
	@echo ""
	@echo "  make version-patch  - Bump patch version (0.0.X)"
	@echo "  make version-minor  - Bump minor version (0.X.0)"
	@echo "  make version        - Show current version"
	@echo ""
	@echo "  make publish-github - Push to GitHub only"
	@echo "  make publish-brew   - Update Homebrew tap only"
	@echo "  make publish-docker - Build/push Docker only"
