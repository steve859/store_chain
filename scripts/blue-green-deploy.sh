#!/bin/bash
# ASR-O2: Blue-Green Deployment Script for AWS ECS + ALB
#
# This script orchestrates a zero-downtime blue-green deployment:
# 1. Determine which environment (blue/green) is currently active
# 2. Deploy new version to the INACTIVE environment
# 3. Run health checks on the new deployment
# 4. Switch ALB traffic to the new environment
# 5. Optionally drain the old environment
#
# Required environment variables:
#   IMAGE_TAG         - Docker image tag to deploy
#   CLUSTER_NAME      - ECS cluster name
#   SERVICE_NAME      - ECS service name
#   BLUE_TG_ARN       - Blue target group ARN
#   GREEN_TG_ARN      - Green target group ARN
#   LISTENER_ARN      - ALB listener ARN
#
# Usage: ./scripts/blue-green-deploy.sh

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────

HEALTH_CHECK_RETRIES=${HEALTH_CHECK_RETRIES:-15}
HEALTH_CHECK_INTERVAL=${HEALTH_CHECK_INTERVAL:-10}
DRAIN_TIMEOUT=${DRAIN_TIMEOUT:-30}

BLUE_SERVICE="${SERVICE_NAME}-blue"
GREEN_SERVICE="${SERVICE_NAME}-green"

# ─── Helper Functions ─────────────────────────────────────────────────────────

log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

error() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] ❌ ERROR: $*" >&2
}

# ─── Step 1: Determine Active Environment ────────────────────────────────────

get_active_environment() {
  log "🔍 Determining active environment..."

  # Check which target group the ALB listener is forwarding to
  ACTIVE_TG=$(aws elbv2 describe-rules \
    --listener-arn "$LISTENER_ARN" \
    --query 'Rules[?IsDefault==`true`].Actions[0].TargetGroupArn' \
    --output text 2>/dev/null || echo "")

  if [ "$ACTIVE_TG" = "$BLUE_TG_ARN" ]; then
    ACTIVE_ENV="blue"
    INACTIVE_ENV="green"
    ACTIVE_SERVICE="$BLUE_SERVICE"
    INACTIVE_SERVICE="$GREEN_SERVICE"
    INACTIVE_TG_ARN="$GREEN_TG_ARN"
  else
    ACTIVE_ENV="green"
    INACTIVE_ENV="blue"
    ACTIVE_SERVICE="$GREEN_SERVICE"
    INACTIVE_SERVICE="$BLUE_SERVICE"
    INACTIVE_TG_ARN="$BLUE_TG_ARN"
  fi

  log "📊 Active: $ACTIVE_ENV | Deploying to: $INACTIVE_ENV"
}

# ─── Step 2: Deploy to Inactive Environment ──────────────────────────────────

deploy_to_inactive() {
  log "🚀 Deploying image '$IMAGE_TAG' to $INACTIVE_ENV environment..."

  # Get current task definition
  TASK_DEF_ARN=$(aws ecs describe-services \
    --cluster "$CLUSTER_NAME" \
    --services "$INACTIVE_SERVICE" \
    --query 'services[0].taskDefinition' \
    --output text 2>/dev/null || echo "")

  if [ -z "$TASK_DEF_ARN" ] || [ "$TASK_DEF_ARN" = "None" ]; then
    # Use the active service's task definition as base
    TASK_DEF_ARN=$(aws ecs describe-services \
      --cluster "$CLUSTER_NAME" \
      --services "$ACTIVE_SERVICE" \
      --query 'services[0].taskDefinition' \
      --output text)
  fi

  # Get task definition JSON and update image
  TASK_DEF=$(aws ecs describe-task-definition \
    --task-definition "$TASK_DEF_ARN" \
    --query 'taskDefinition')

  REGISTRY="${REGISTRY:-ghcr.io}"
  IMAGE_FULL="${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"

  # Create new task definition with updated image
  NEW_TASK_DEF=$(echo "$TASK_DEF" | jq \
    --arg IMAGE "$IMAGE_FULL" \
    '.containerDefinitions[0].image = $IMAGE |
     del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)')

  NEW_TASK_DEF_ARN=$(aws ecs register-task-definition \
    --cli-input-json "$NEW_TASK_DEF" \
    --query 'taskDefinition.taskDefinitionArn' \
    --output text)

  log "📋 New task definition: $NEW_TASK_DEF_ARN"

  # Update the inactive service with new task definition
  aws ecs update-service \
    --cluster "$CLUSTER_NAME" \
    --service "$INACTIVE_SERVICE" \
    --task-definition "$NEW_TASK_DEF_ARN" \
    --desired-count 2 \
    --force-new-deployment \
    > /dev/null

  log "⏳ Waiting for $INACTIVE_ENV service to stabilize..."
  aws ecs wait services-stable \
    --cluster "$CLUSTER_NAME" \
    --services "$INACTIVE_SERVICE"

  log "✅ $INACTIVE_ENV service is stable"
}

# ─── Step 3: Health Check on New Deployment ──────────────────────────────────

health_check_inactive() {
  log "🏥 Running health checks on $INACTIVE_ENV environment..."

  # Get task IPs from the inactive target group
  TARGETS=$(aws elbv2 describe-target-health \
    --target-group-arn "$INACTIVE_TG_ARN" \
    --query 'TargetHealthDescriptions[].Target.Id' \
    --output text 2>/dev/null || echo "")

  if [ -z "$TARGETS" ]; then
    log "⚠️  No targets found in $INACTIVE_ENV target group, checking ECS tasks..."

    # Fallback: check ECS service tasks directly
    TASK_ARNS=$(aws ecs list-tasks \
      --cluster "$CLUSTER_NAME" \
      --service-name "$INACTIVE_SERVICE" \
      --desired-status RUNNING \
      --query 'taskArns[]' \
      --output text)

    if [ -z "$TASK_ARNS" ]; then
      error "No running tasks in $INACTIVE_ENV service"
      return 1
    fi

    log "✅ Found running tasks in $INACTIVE_ENV, proceeding with ALB health check..."
  fi

  # Wait for target group health
  for i in $(seq 1 "$HEALTH_CHECK_RETRIES"); do
    HEALTHY_COUNT=$(aws elbv2 describe-target-health \
      --target-group-arn "$INACTIVE_TG_ARN" \
      --query 'length(TargetHealthDescriptions[?TargetHealth.State==`healthy`])' \
      --output text 2>/dev/null || echo "0")

    if [ "$HEALTHY_COUNT" -ge 1 ]; then
      log "✅ Health check passed! $HEALTHY_COUNT healthy target(s) in $INACTIVE_ENV"
      return 0
    fi

    log "⏳ Health check attempt $i/$HEALTH_CHECK_RETRIES: $HEALTHY_COUNT healthy targets, waiting ${HEALTH_CHECK_INTERVAL}s..."
    sleep "$HEALTH_CHECK_INTERVAL"
  done

  error "Health check failed after $HEALTH_CHECK_RETRIES attempts"
  return 1
}

# ─── Step 4: Switch Traffic (Blue → Green or Green → Blue) ──────────────────

switch_traffic() {
  log "🔄 Switching ALB traffic from $ACTIVE_ENV → $INACTIVE_ENV..."

  aws elbv2 modify-rule \
    --rule-arn "$(aws elbv2 describe-rules \
      --listener-arn "$LISTENER_ARN" \
      --query 'Rules[?IsDefault==`true`].RuleArn' \
      --output text)" \
    --actions Type=forward,TargetGroupArn="$INACTIVE_TG_ARN" \
    > /dev/null

  log "✅ Traffic switched to $INACTIVE_ENV"
}

# ─── Step 5: Drain Old Environment ───────────────────────────────────────────

drain_old_environment() {
  log "🔻 Draining $ACTIVE_ENV environment (waiting ${DRAIN_TIMEOUT}s for in-flight requests)..."
  sleep "$DRAIN_TIMEOUT"

  # Scale down old environment to save resources (keep 1 instance for quick rollback)
  aws ecs update-service \
    --cluster "$CLUSTER_NAME" \
    --service "$ACTIVE_SERVICE" \
    --desired-count 1 \
    > /dev/null

  log "✅ $ACTIVE_ENV scaled down to 1 instance (rollback standby)"
}

# ─── Step 6: Rollback (if needed) ────────────────────────────────────────────

rollback() {
  error "Deployment failed! Rolling back to $ACTIVE_ENV..."

  # Switch traffic back
  ACTIVE_TG_ARN="$BLUE_TG_ARN"
  [ "$ACTIVE_ENV" = "green" ] && ACTIVE_TG_ARN="$GREEN_TG_ARN"

  aws elbv2 modify-rule \
    --rule-arn "$(aws elbv2 describe-rules \
      --listener-arn "$LISTENER_ARN" \
      --query 'Rules[?IsDefault==`true`].RuleArn' \
      --output text)" \
    --actions Type=forward,TargetGroupArn="$ACTIVE_TG_ARN" \
    > /dev/null

  # Scale down failed deployment
  aws ecs update-service \
    --cluster "$CLUSTER_NAME" \
    --service "$INACTIVE_SERVICE" \
    --desired-count 0 \
    > /dev/null

  error "Rolled back to $ACTIVE_ENV"
  exit 1
}

# ─── Main Execution ──────────────────────────────────────────────────────────

main() {
  log "═══════════════════════════════════════════"
  log "  ASR-O2: Blue-Green Deployment"
  log "  Image: $IMAGE_TAG"
  log "  Cluster: $CLUSTER_NAME"
  log "═══════════════════════════════════════════"

  get_active_environment

  deploy_to_inactive || rollback

  health_check_inactive || rollback

  switch_traffic

  drain_old_environment

  log ""
  log "═══════════════════════════════════════════"
  log "  ✅ DEPLOYMENT COMPLETE"
  log "  Active: $INACTIVE_ENV"
  log "  Standby: $ACTIVE_ENV (1 instance)"
  log "═══════════════════════════════════════════"
}

main "$@"
