import { handleVistosRequest } from '../../_lib/vistos-jobs-api.js';
export const onRequestGet = context => handleVistosRequest(context, 'jobs-list');
