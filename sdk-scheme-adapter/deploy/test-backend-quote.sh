#!/bin/bash

# Script pour tester la réponse du backend GTO aux quotes
# Ce script montre le format EXACT que le backend doit renvoyer

echo "=========================================="
echo "TEST DE LA RÉPONSE DU BACKEND GTO"
echo "=========================================="
echo ""

BACKEND_URL="http://192.168.0.152:8000/mojaloop/quotes"

echo "1. Envoi d'une requête de quote au backend GTO..."
echo "   URL: $BACKEND_URL"
echo ""

# Exemple de requête de quote (format Mojaloop standard)
QUOTE_REQUEST='{
  "quoteId": "test-quote-123",
  "transactionId": "test-txn-123",
  "transactionRequestId": null,
  "payee": {
    "partyIdInfo": {
      "partyIdType": "MSISDN",
      "partyIdentifier": "22890000002",
      "fspId": "GTO"
    }
  },
  "payer": {
    "partyIdInfo": {
      "partyIdType": "MSISDN",
      "partyIdentifier": "22890000001",
      "fspId": "PAYER"
    }
  },
  "amountType": "SEND",
  "amount": {
    "amount": "10000",
    "currency": "XOF"
  },
  "transactionType": {
    "scenario": "TRANSFER",
    "initiator": "PAYER",
    "initiatorType": "CONSUMER"
  }
}'

echo "Requête envoyée:"
echo "$QUOTE_REQUEST" | jq .
echo ""

# Obtenir le token OAuth si nécessaire
echo "2. Obtention du token OAuth..."
TOKEN_RESPONSE=$(curl -s -X POST "https://dev.bftpay.co/api/token/pair" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "0050",
    "password": "11111",
    "tenant": "fececam"
  }')

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access')

if [ "$ACCESS_TOKEN" = "null" ] || [ -z "$ACCESS_TOKEN" ]; then
  echo "❌ ERREUR: Impossible d'obtenir le token OAuth"
  echo "Réponse: $TOKEN_RESPONSE"
  exit 1
fi

echo "✅ Token obtenu avec succès"
echo ""

# Appel au backend avec le token
echo "3. Appel au backend GTO avec le token..."
RESPONSE=$(curl -s -X POST "$BACKEND_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "$QUOTE_REQUEST")

echo "Réponse du backend:"
echo "$RESPONSE" | jq .
echo ""

# Vérification des champs
echo "=========================================="
echo "ANALYSE DE LA RÉPONSE"
echo "=========================================="
echo ""

HAS_ILP_PACKET=$(echo "$RESPONSE" | jq 'has("ilpPacket")')
HAS_CONDITION=$(echo "$RESPONSE" | jq 'has("condition")')
HAS_TRANSFER_AMOUNT=$(echo "$RESPONSE" | jq 'has("transferAmount")')
HAS_EXPIRATION=$(echo "$RESPONSE" | jq 'has("expiration")')

echo "Champs présents dans la réponse:"
echo "  - ilpPacket: $HAS_ILP_PACKET"
echo "  - condition: $HAS_CONDITION"
echo "  - transferAmount: $HAS_TRANSFER_AMOUNT"
echo "  - expiration: $HAS_EXPIRATION"
echo ""

if [ "$HAS_ILP_PACKET" = "true" ] || [ "$HAS_CONDITION" = "true" ]; then
  echo "❌ PROBLÈME DÉTECTÉ!"
  echo ""
  echo "Le backend envoie les champs 'ilpPacket' et/ou 'condition'."
  echo "Ces champs doivent être COMPLÈTEMENT SUPPRIMÉS de la réponse."
  echo ""
  echo "Le SDK Mojaloop génère lui-même ces valeurs pour des raisons de sécurité."
  echo "Même des chaînes vides \"\" causent une erreur."
  echo ""
  echo "=========================================="
  echo "FORMAT ATTENDU (CORRECT)"
  echo "=========================================="
  echo ""
  echo "Le backend GTO doit renvoyer UNIQUEMENT:"
  cat <<'EOF' | jq .
{
  "transferAmount": {
    "amount": "10000",
    "currency": "XOF"
  },
  "payeeReceiveAmount": {
    "amount": "9700",
    "currency": "XOF"
  },
  "payeeFspFee": {
    "amount": "300",
    "currency": "XOF"
  },
  "expiration": "2026-06-09T14:00:00.000Z"
}
EOF
  echo ""
  echo "⚠️  NE PAS inclure les champs suivants:"
  echo "   - ilpPacket (le SDK le génère)"
  echo "   - condition (le SDK le génère)"
  echo "   - fulfilment (uniquement pour PUT /transfers)"
  echo ""
else
  echo "✅ RÉPONSE CORRECTE!"
  echo ""
  echo "Le backend ne renvoie pas les champs ilpPacket/condition."
  echo "C'est le comportement attendu pour Mojaloop SDK."
  echo ""
fi

echo "=========================================="
echo "INSTRUCTIONS POUR CORRIGER LE BACKEND GTO"
echo "=========================================="
echo ""
echo "Si le test ci-dessus montre que ilpPacket/condition sont présents,"
echo "vous devez modifier le code du backend GTO pour:"
echo ""
echo "1. Supprimer complètement ces lignes du code de réponse:"
echo "   - \"ilpPacket\": \"...\""
echo "   - \"condition\": \"...\""
echo ""
echo "2. Ne pas les définir comme chaînes vides non plus:"
echo "   - \"ilpPacket\": \"\"  ❌ INCORRECT"
echo "   - \"condition\": \"\"   ❌ INCORRECT"
echo ""
echo "3. Les omettre totalement de la réponse JSON"
echo ""
echo "4. Garder uniquement les champs financiers:"
echo "   - transferAmount (obligatoire)"
echo "   - payeeReceiveAmount (optionnel)"
echo "   - payeeFspFee (optionnel)"
echo "   - payeeFspCommission (optionnel)"
echo "   - expiration (obligatoire)"
echo ""
