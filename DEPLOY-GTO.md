# Guide de déploiement DFSP: GTO

## Informations du DFSP

| Paramètre | Valeur |
|-----------|--------|
| **DFSP ID** | `GTO` |
| **FQDN** | `gto.mojaloop.local` |
| **Devise** | XOF |
| **Keycloak client** | `gto-client` (realm `dfsps`) |
| **Namespace K8s** | `dfsp-gto` |
| **Hub MCM** | `http://traefik.kube-system.svc.cluster.local:80` |
| **Hub Keycloak** | `http://keycloak.mojaloop.svc.cluster.local:8080` |
| **Hub extapi** | `moja-ml-api-adapter-service.mojaloop.svc.cluster.local:80` |
| **Mode** | Single-tenant standalone |
| **Backend** | Simulateur Mojaloop |

---

## Déploiement

### Script automatique (idempotent)

```bash
./gto/deploy-gto.sh
```

### Commandes manuelles

```bash
# 1. Namespace
kubectl create namespace dfsp-gto

# 2. Secret OIDC (clientSecret Keycloak)
kubectl -n dfsp-gto create secret generic gto-dfsp-auth \
  --from-literal=clientSecret='LDPT5Nxu1Gkp3XpEwsNti5VkIJ8RhDDp'

# 3. Helm install
helm upgrade --install dfsp . \
  --namespace dfsp-gto \
  --values gto/gto-values.yaml \
  --timeout 10m

# 4. Vérifier
kubectl -n dfsp-gto get pods
```

---

## Vérification post-déploiement

```bash
# Tous les pods doivent être Running
kubectl -n dfsp-gto get pods
# dfsp-vault-0              2/2 Running  (vault + unsealer sidecar)
# dfsp-mcm-agent-xxx        1/1 Running
# dfsp-sdk-scheme-adapter   1/1 Running
# dfsp-redis-0              1/1 Running
# dfsp-sim-backend-xxx      1/1 Running
# dfsp-vault-init-xxx       0/1 Completed

# Logs mcm-agent
kubectl -n dfsp-gto logs deploy/dfsp-mcm-agent -f

# Recovery kit Vault (À SAUVEGARDER)
kubectl -n dfsp-gto get secret dfsp-vault-recovery-kit -o yaml > dfsp-GTO-recovery-kit.yaml
```

---

## Mise à jour

```bash
helm upgrade dfsp /opt/mojaloop/iac-deployment/ml-deployment-toolkit/dfsp \
  --namespace dfsp-gto \
  --values /opt/mojaloop/iac-deployment/ml-deployment-toolkit/dfsp/gto/gto-values.yaml
```

---

## Désinstallation

```bash
helm uninstall dfsp -n dfsp-gto
kubectl delete pvc -n dfsp-gto -l app.kubernetes.io/instance=dfsp
kubectl delete namespace dfsp-gto
```

> **Attention :** sauvegarder le recovery kit Vault avant de supprimer.

---

## Ports utiles

```bash
# MCM Agent API
kubectl -n dfsp-gto port-forward svc/dfsp-mcm-agent 3000:3000

# SDK metrics
kubectl -n dfsp-gto port-forward svc/dfsp-sdk-scheme-adapter-internal 4040:4040

# Simulateur test UI
kubectl -n dfsp-gto port-forward svc/dfsp-sim-backend-test 3003:3003
```
