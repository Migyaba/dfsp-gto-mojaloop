/*****
 License
 --------------
 Copyright © 2020-2025 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Mojaloop Foundation for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Mojaloop Foundation
 - James Bush <jbush@mojaloop.io>

 --------------
 ******/
'use strict';

const { createHttpRequester } = require('@mojaloop/sdk-standard-components').httpRequester;
const { buildUrl, HTTPResponseError } = require('./common');
const AuthManager = require('./authManager');
const { mojaloopPartyToInternalParty } = require('../shared');


/**
 * A class for making requests to DFSP backend API
 */
class BackendRequests {
    constructor(config) {
        this.config = config;
        this.logger = config.logger.push({ component: this.constructor.name });

        // Create HTTP requester with shared agents if available
        const httpConfig = {
            timeout: 65000,
            withCredentials: false,
            transitional: {
                clarifyTimeoutError: true,
            }
        };

        // Add shared agents to prevent connection recreation per request
        if (config.sharedAgents) {
            httpConfig.httpAgent = config.sharedAgents.httpAgent;
            httpConfig.httpsAgent = config.sharedAgents.httpsAgent;
            this.logger.isDebugEnabled && this.logger.debug('Using shared HTTP/HTTPS agents for BackendRequests');
        }

        this.requester = createHttpRequester({
            logger: this.logger,
            httpConfig
        });

        // FSPID of THIS DFSP
        this.dfspId = config.dfspId;

        this.transportScheme = 'http';

        // Switch or peer DFSP endpoint
        // Handle full URLs that already include protocol
        const rawEndpoint = config.backendEndpoint;
        if (/^https?:\/\//.test(rawEndpoint)) {
            this.backendEndpoint = rawEndpoint.replace(/\/*$/, '');
        } else {
            this.backendEndpoint = `${this.transportScheme}://${rawEndpoint}`;
        }


        // Derive Mojaloop resource URLs from the single BACKEND_ENDPOINT.
        const defaultPartsEndpoint = config.backendEndpoint ? this.backendEndpoint : undefined;
        const defaultQuotesEndpoint = config.backendEndpoint ? `${this.backendEndpoint}/quotes` : undefined;
        const defaultTransfersEndpoint = config.backendEndpoint ? this.backendEndpoint : undefined;

        this.backendPartiesEndpoint = config.backendPartiesEndpoint || defaultPartsEndpoint;
        this.backendQuoteRequestsEndpoint = config.backendQuoteRequestsEndpoint || defaultQuotesEndpoint;
        this.backendTransfersEndpoint = config.backendTransfersEndpoint || defaultTransfersEndpoint;
        this.backendTransactionRequestsEndpoint = config.backendTransactionRequestsEndpoint;
        this.backendFxQuotesEndpoint = config.backendFxQuotesEndpoint || this.backendEndpoint;
        this.backendFxTransfersEndpoint = config.backendFxTransfersEndpoint || this.backendEndpoint;
        this.backendRequestToPayEndpoint = config.backendRequestToPayEndpoint || this.backendEndpoint;
        this.backendOtpEndpoint = config.backendOtpEndpoint || this.backendEndpoint;
        this.backendBulkQuotesEndpoint = config.backendBulkQuotesEndpoint || this.backendEndpoint;
        this.backendBulkTransfersEndpoint = config.backendBulkTransfersEndpoint || this.backendEndpoint;
        this.backendBulkTransactionsEndpoint = config.backendBulkTransactionsEndpoint || this.backendEndpoint;

        // Initialize authentication manager
        this.authManager = new AuthManager(config, this.logger);

        // Log API Key configuration status
        this.logger.isInfoEnabled && this.logger.push({
            hasApiKey: !!config.dfspFeesApiKey,
            hasApiSecret: !!config.dfspFeesApiSecret,
            apiKeyLength: config.dfspFeesApiKey?.length || 0,
            apiSecretLength: config.dfspFeesApiSecret?.length || 0
        }).info('API Key configuration loaded');
        
    }

    /**
     * Executes a GET /otp request for the specified transaction request id
     *
     * @returns {object} - JSON response body if one was received
     */
    async getOTP(transactionRequestId) {
        const url = `otp/${transactionRequestId}`;
        return this._get(url, this.backendOtpEndpoint);
    }


    /**
     * Executes a GET /parties request for the specified identifier type and identifier
     *
     * @returns {object} - JSON response body if one was received
     */
    async getParties(idType, idValue, idSubValue) {
        try {
            // Check if we have a custom parties endpoint that uses a different URL pattern
            let url;
            if (this.backendPartiesEndpoint && this.backendPartiesEndpoint.includes('/api/customer')) {
                // For custom API endpoints, send idType and idValue as query parameters
                url = `?idType=${encodeURIComponent(idType)}&idValue=${encodeURIComponent(idValue)}`;
                if (idSubValue) {
                    url += `&idSubValue=${encodeURIComponent(idSubValue)}`;
                }
                this.logger.isInfoEnabled && this.logger.push({
                    idType,
                    idValue,
                    idSubValue,
                    url,
                    endpoint: this.backendPartiesEndpoint,
                    customApiFormat: true,
                    finalUrl: `${this.backendPartiesEndpoint}${url}`
                }).info('Using custom API format - query parameters');
            } else {
                // Default behavior: construct URL with idType/idValue/idSubValue
                const pathSegments = [idType, idValue];
                if (idSubValue) {
                    pathSegments.push(idSubValue);
                }
                url = pathSegments.map((segment) => encodeURIComponent(segment)).join('/');
                this.logger.isInfoEnabled && this.logger.push({
                    idType,
                    idValue,
                    idSubValue,
                    url,
                    endpoint: this.backendPartiesEndpoint,
                    customApiFormat: false
                }).info('Using standard API format - idType/idValue');
            }
            
            const result = await this._get(url, this.backendPartiesEndpoint);
            
            this.logger.isInfoEnabled && this.logger.push({ result }).info('Backend getParties response received');
            
            return result;
        } catch (err) {
            this.logger.isErrorEnabled && this.logger.push({ 
                err,
                errMessage: err?.message,
                errStack: err?.stack,
                idType,
                idValue,
                endpoint: this.backendPartiesEndpoint
            }).error('Error in backendRequests.getParties');
            throw err;
        }
    }

    /**
     * Executes a GET /transfers request for the specified transfer ID
     *
     * @returns {object} - JSON response body if one was received
     */
    async getTransfers(transferId) {
        const url = `transfers/${transferId}`;
        return this._get(url, this.backendTransfersEndpoint);
    }


    /**
     * Executes a POST /quotes request for the specified quote request
     *
     * @returns {object} - JSON response body if one was received
     */
    async postQuoteRequests(quoteRequest) {
        // For custom quote endpoints (like Frappe), don't add /quoterequests suffix
        // The endpoint URL is already complete
        if (this.backendQuoteRequestsEndpoint) {
            return this._post('', quoteRequest, this.backendQuoteRequestsEndpoint);
        }
        // For standard backends, use the /quoterequests path
        return this._post('quoterequests', quoteRequest, this.backendQuoteRequestsEndpoint);
    }


    /**
     * Executes a POST /transfers request for the specified transfer prepare
     *
     * @returns {object} - JSON response body if one was received
     */
    async postTransfers(prepare) {
        return this._post('transfers', prepare, this.backendTransfersEndpoint);
    }

    /**
     * Executes a POST /fxQuotes request for the specified fxQuotes request
     *
     * @returns {object} - JSON response body if one was received
     */
    async postFxQuotes(payload) {
        return this._post('fxQuotes', payload, this.backendFxQuotesEndpoint);
    }

    /**
     * Executes a POST /fxTransfers request for the specified fxTransfer prepare
     *
     * @returns {object} - JSON response body if one was received
     */
    async postFxTransfers(payload) {
        return this._post('fxTransfers', payload, this.backendFxTransfersEndpoint);
    }

    async putFxTransfersNotification(notification, conversionId) {
        const url = `fxTransfers/${conversionId}`;
        return this._put(url, notification, this.backendFxTransfersEndpoint);
    }

    /**
     * Executes a POST /transactionRequests request for the specified transaction request
     *
     * @returns {object} - JSON response body if one was received
     */
    async postTransactionRequests(transactionRequest) {
        return this._post('transactionrequests', transactionRequest, this.backendTransactionRequestsEndpoint);
    }

    /**
     * Executes a POST /bulkQuotes request for the specified bulk quotes request
     *
     * @returns {object} - JSON response body if one was received
     */
    async postBulkQuotes(bulkQuotesRequest) {
        return this._post('bulkQuotes', bulkQuotesRequest, this.backendBulkQuotesEndpoint);
    }

    /**
     * Executes a GET /bulkQuotes/{ID} request for the specified bulk quote ID
     *
     * @returns {object} - JSON response body if one was received
     */
    async getBulkQuotes(bulkQuoteId) {
        const url = `bulkQuotes/${bulkQuoteId}`;
        return this._get(url, this.backendBulkQuotesEndpoint);
    }

    /**
     * Executes a POST /bulkTransfers request for the specified bulk transfer prepare
     *
     * @returns {object} - JSON response body if one was received
     */
    async postBulkTransfers(prepare) {
        return this._post('bulkTransfers', prepare, this.backendBulkTransfersEndpoint);
    }

    /**
     * Executes a GET /bulkTransfers/{ID} request for the specified bulk transfer ID
     *
     * @returns {object} - JSON response body if one was received
     */
    async getBulkTransfers(bulkTransferId) {
        const url = `bulkTransfers/${bulkTransferId}`;
        return this._get(url, this.backendBulkTransfersEndpoint);
    }

    /**
     * Executes a PUT /transfers/{ID} request to forward notification for success
     *
     * @returns {object} - JSON response body if one was received
     */

    async putTransfersNotification(notifcation, transferId) {
        const url = `transfers/${transferId}`;
        return this._put(url, notifcation, this.backendTransfersEndpoint);
    }

    /**
     * Executes a PUT /requestToPay/{ID} request to forward notification for success
     *
     * @returns {object} - JSON response body if one was received
     */

    async putRequestToPayNotification(notifcation, transactionRequestId) {
        const url = `requestToPay/${transactionRequestId}`;
        return this._put(url, notifcation, this.backendRequestToPayEndpoint);
    }

    /**
     * Executes a PUT /bulkTransactions/{ID} request
     *
     * @returns {object} - JSON response body if one was received
     */

    async putBulkTransactions(transactionId, body) {
        const url = `bulkTransactions/${transactionId}`;
        return this._put(url, body, this.backendBulkTransactionsEndpoint);
    }

    /**
     * Utility function for building outgoing request headers as required by the mojaloop api spec
     *
     * @param {string} endpoint - The endpoint being called (to determine auth type)
     * @returns {object} - headers object for use in requests to mojaloop api endpoints
     */
    async _buildHeaders (endpoint) {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Date': new Date().toUTCString()
        };

        // Check if this is a quote endpoint request and API Key auth is configured
        const isQuoteEndpoint = endpoint === this.backendQuoteRequestsEndpoint;
        const hasApiKeyAuth = this.config.dfspFeesApiKey && this.config.dfspFeesApiSecret;

        this.logger.isInfoEnabled && this.logger.push({ 
            endpoint,
            backendQuoteRequestsEndpoint: this.backendQuoteRequestsEndpoint,
            isQuoteEndpoint,
            hasApiKeyAuth,
            apiKeyPresent: !!this.config.dfspFeesApiKey,
            apiSecretPresent: !!this.config.dfspFeesApiSecret
        }).info('Checking authentication type for endpoint');

        if (isQuoteEndpoint && hasApiKeyAuth) {
            // Use API Key authentication for quote service
            const apiKeyAuth = `token ${this.config.dfspFeesApiKey}:${this.config.dfspFeesApiSecret}`;
            headers['Authorization'] = apiKeyAuth;
            
            this.logger.isInfoEnabled && this.logger.push({ 
                endpoint,
                authType: 'apiKey'
            }).info('Using API Key authentication for quote endpoint');
        } else {
            // Use OAuth authentication from AuthManager for other endpoints
            const authHeaders = await this.authManager.buildAuthHeaders();
            Object.assign(headers, authHeaders);
            
            this.logger.isInfoEnabled && this.logger.push({ 
                endpoint,
                authType: 'oauth'
            }).info('Using OAuth authentication');
        }

        return headers;
    }

    async _get(url, endpoint) {
        const reqOpts = {
            method: 'GET',
            uri: this._buildUri(endpoint, url),
            headers: await this._buildHeaders(endpoint),
        };
        // Note we do not JWS sign requests with no body i.e. GET requests
        return this.sendRequest(reqOpts);
    }


    async _put(url, body, endpoint) {
        const reqOpts = {
            method: 'PUT',
            uri: this._buildUri(endpoint, url),
            headers: await this._buildHeaders(endpoint),
            body: JSON.stringify(body)
        };
        return this.sendRequest(reqOpts);
    }


    async _post(url, body, endpoint) {
        try {
            const reqOpts = {
                method: 'POST',
                uri: this._buildUri(endpoint, url),
                headers: await this._buildHeaders(endpoint),
                body: JSON.stringify(body),
            };
            return this.sendRequest(reqOpts);
        } catch (err) {
            this.logger.push({ err, url, endpoint }).error('Error in _post method');
            throw err;
        }
    }

    async _patch(url, body, endpoint) {
        const reqOpts = {
            method: 'PATCH',
            uri : this._buildUri(endpoint, url),
            headers: await this._buildHeaders(endpoint),
            body: JSON.stringify(body)
        };
        return this.sendRequest(reqOpts);
    }

    _buildUri(endpoint, url) {
        const builtEndpoint = this._buildEndpoint(endpoint);
        return url ? buildUrl(builtEndpoint, url) : builtEndpoint;
    }

    _buildEndpoint(endpoint) {
        const base = endpoint || this.backendEndpoint;
        if (/^https?:\/\//.test(base)) {
            return base.replace(/\/*$/, '');
        }
        return `${this.transportScheme}://${base.replace(/\/*$/, '')}`;
    }

    async sendRequest(reqOptions) {
        try {
            this.logger.isInfoEnabled && this.logger.push({ 
                method: reqOptions?.method,
                uri: reqOptions?.uri 
            }).info(`Sending HTTP request to backend`);
            
            this.logger.isVerboseEnabled && this.logger.push({ reqOptions }).verbose(`Executing HTTP ${reqOptions?.method}...`);
            const res = await this.requester.sendRequest({ ...reqOptions });

            const data = (res.headers['content-length'] === '0' || res.statusCode === 204)
                ? null
                : res.data;
            
            this.logger.isInfoEnabled && this.logger.push({ 
                statusCode: res.statusCode,
                hasData: !!data 
            }).info('Received HTTP response from backend');
            
            this.logger.isVerboseEnabled && this.logger.push({ data }).verbose('Received HTTP response data');
            return data;
        } catch (err) {
            this.logger.push({ err }).error(`Error attempting ${reqOptions?.method} ${reqOptions?.uri}`);
            const { data, headers, status } = err.response || err;
            throw new HTTPResponseError({
                res: { data, headers, status },
                msg: err?.message
            });
        }
    }
}

/**
 * Normalises a backend party lookup response into the SDK internal party shape.
 *
 * @param {object} backendResponse - raw JSON from the DFSP backend
 * @param {{ idType: string, idValue: string, idSubValue?: string }} ids - hub request identifiers
 * @returns {object} internal party
 */
const backendPartyResponseToInternal = (backendResponse, { idType, idValue, idSubValue }) => {
    const ids = { idType, idValue, ...(idSubValue && { idSubValue }) };

    if (!backendResponse || typeof backendResponse !== 'object') {
        return { ...ids };
    }

    const data = (backendResponse.message && typeof backendResponse.message === 'object')
        ? backendResponse.message
        : backendResponse;

    if (data.partyIdInfo) {
        return {
            ...mojaloopPartyToInternalParty({ partyIdInfo: data.partyIdInfo, name: data.name, personalInfo: data.personalInfo }),
            ...ids,
        };
    }

    if (data.idType && data.idValue) {
        return { ...data, ...ids };
    }

    if (data.first_name || data.customer_number || data.name) {
        const internal = {
            ...ids,
            firstName: data.first_name,
            middleName: data.middle_name,
            lastName: data.last_name,
            displayName: data.name,
        };

        if (data.birthdate) {
            const parts = String(data.birthdate).split('.');
            if (parts.length === 3) {
                const [dd, mm, yyyy] = parts;
                internal.dateOfBirth = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
            } else {
                internal.dateOfBirth = data.birthdate;
            }
        }

        const extension = [];
        if (data.customer_number) {
            extension.push({ key: 'customer_number', value: String(data.customer_number) });
        }
        if (data.phone_number) {
            extension.push({ key: 'phone_number', value: String(data.phone_number) });
        }
        if (data.accounts) {
            extension.push({ key: 'accounts', value: JSON.stringify(data.accounts) });
        }
        if (extension.length > 0) {
            internal.extensionList = extension;
        }

        return internal;
    }

    return { ...data, ...ids };
};


module.exports = {
    BackendRequests,
    HTTPResponseError,
    backendPartyResponseToInternal,
};
