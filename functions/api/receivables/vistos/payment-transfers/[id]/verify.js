import { handleVistosRequest } from '../../../../../_lib/vistos-jobs-api.js';
export const onRequestPost = context => handleVistosRequest(context, 'transfer-verify');
