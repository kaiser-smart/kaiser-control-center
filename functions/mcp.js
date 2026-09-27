import { proxyForpsiOAuth } from './_lib/forpsi-oauth-proxy.js';
export const onRequest=context=>proxyForpsiOAuth(context.request,context.env);
