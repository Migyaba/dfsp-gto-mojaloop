#!/bin/bash
# =============================================================================
# Script de déploiement DFSP: GTO (single-tenant standalone)
# =============================================================================
set -e

DFSP_ID="GTO"
DFSP_NAME="gto"
NAMESPACE="dfsp-${DFSP_NAME}"
RELEASE_NAME="dfsp"
OIDC_CLIENT_SECRET="LDPT5Nxu1Gkp3XpEwsNti5VkIJ8RhDDp"
CHART_PATH="$(dirname "$0")/.."
VALUES_FILE="$(dirname "$0")/gto-values.yaml"

echo "=========================================="
echo "Déploiement DFSP: ${DFSP_ID}"
echo "=========================================="

echo ""
echo "[1/4] Création du namespace: ${NAMESPACE}"
kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

echo ""
echo "[2/4] Création du secret OIDC"
kubectl -n "${NAMESPACE}" create secret generic "${DFSP_NAME}-dfsp-auth" \
  --from-literal=clientSecret="${OIDC_CLIENT_SECRET}" \
  --dry-run=client -o yaml | kubectl apply -f -
echo "✓ Secret créé: ${DFSP_NAME}-dfsp-auth"

echo ""
echo "[3/4] Déploiement Helm"
helm upgrade --install "${RELEASE_NAME}" "${CHART_PATH}" \
  --namespace "${NAMESPACE}" \
  --values "${VALUES_FILE}" \
  --timeout 10m

echo "✓ Déploiement Helm réussi"

echo ""
echo "[4/4] Statut des pods"
kubectl -n "${NAMESPACE}" get pods

echo ""
echo "=========================================="
echo "✓ Déploiement GTO terminé"
echo "=========================================="
echo ""
echo "Prochaines étapes:"
echo "  Logs mcm-agent : kubectl -n ${NAMESPACE} logs deploy/dfsp-mcm-agent -f"
echo "  Recovery kit   : kubectl -n ${NAMESPACE} get secret dfsp-vault-recovery-kit -o yaml"
echo "  Simulator UI   : kubectl -n ${NAMESPACE} port-forward svc/dfsp-sim-backend-test 3003:3003"
echo ""
