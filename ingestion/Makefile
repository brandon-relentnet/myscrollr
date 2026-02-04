# Image Names
IMG_FINANCE := scrollr-finance
IMG_SPORTS := scrollr-sports
IMG_YAHOO := scrollr-yahoo

# Build Commands (Run from root context)
build-finance:
	docker build -f finance_service/Dockerfile -t $(IMG_FINANCE) .

build-sports:
	docker build -f sports_service/Dockerfile -t $(IMG_SPORTS) .

build-yahoo:
	docker build -f yahoo_service/Dockerfile -t $(IMG_YAHOO) .

build-all: build-finance build-sports build-yahoo

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

# Clean up dangling images
clean:
	docker rmi $(IMG_FINANCE) $(IMG_SPORTS) $(IMG_YAHOO)