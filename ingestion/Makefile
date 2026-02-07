# Image Names
IMG_FINANCE := scrollr-finance
IMG_SPORTS := scrollr-sports
IMG_YAHOO := scrollr-yahoo
IMG_RSS := scrollr-rss

# Build Commands (Run from root context)
build-finance:
	docker build -f finance_service/Dockerfile -t $(IMG_FINANCE) .

build-sports:
	docker build -f sports_service/Dockerfile -t $(IMG_SPORTS) .

build-yahoo:
	docker build -f yahoo_service/Dockerfile -t $(IMG_YAHOO) .

build-rss:
	docker build -f rss_service/Dockerfile -t $(IMG_RSS) .

build-all: build-finance build-sports build-yahoo build-rss

# Run Commands (Using host networking to access SSH tunnel)
run-finance:
	@echo "Starting Finance Service on port 3001..."
	docker run --rm -it \
		--network host \
		--env-file .env \
		$(IMG_FINANCE)

run-sports:
	@echo "Starting Sports Service on port 3002..."
	docker run --rm -it \
		--network host \
		--env-file .env \
		$(IMG_SPORTS)

run-yahoo:
	@echo "Starting Yahoo Service on port 8443..."
	docker run --rm -it \
		--network host \
		--env-file .env \
		$(IMG_YAHOO)

run-rss:
	@echo "Starting RSS Service on port 3004..."
	docker run --rm -it \
		--network host \
		--env-file .env \
		$(IMG_RSS)

# Clean up dangling images
clean:
	docker rmi $(IMG_FINANCE) $(IMG_SPORTS) $(IMG_YAHOO) $(IMG_RSS)
