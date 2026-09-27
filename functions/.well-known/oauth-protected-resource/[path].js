import { proxyForpsiOAuth } from '../../_lib/forpsi-oauth-proxy.js';
export const onRequestGet=context=>proxyForpsiOAuth(context.request,context.env);
