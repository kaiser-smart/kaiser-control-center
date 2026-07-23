import { json, requireUserPermission } from "../../_lib/auth.js";
import { dataBoxPlusApiStatus, dataBoxPlusStoreErrorResponse, listDataBoxPlusMessagesPage } from "../../_lib/data-box-plus-store.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "data-box-plus", "view");
  if (response) return response;

  const url = new URL(request.url);
  try {
    const page = await listDataBoxPlusMessagesPage(env, {
      limit: url.searchParams.get("limit"),
      page: url.searchParams.get("page"),
      mailboxId: url.searchParams.get("mailboxId"),
      direction: url.searchParams.get("direction"),
      status: url.searchParams.get("status"),
      sender: url.searchParams.get("sender"),
      query: url.searchParams.get("query"),
      dateFrom: url.searchParams.get("dateFrom"),
      dateTo: url.searchParams.get("dateTo"),
      due: url.searchParams.get("due"),
      attachment: url.searchParams.get("attachment"),
      archive: url.searchParams.get("archive"),
      priority: url.searchParams.get("priority"),
      sort: url.searchParams.get("sort"),
      order: url.searchParams.get("order")
    });
    return json({
      apiStatus: dataBoxPlusApiStatus(env),
      ...page
    });
  } catch (error) {
    const result = dataBoxPlusStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}
