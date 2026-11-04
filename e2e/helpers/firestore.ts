import { URLS } from './constants';

const BASE_URL = `${URLS.firestore}/v1/projects/demo-foodcourt/databases/default/documents`;

function decodeValue(v: any): any {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return new Date(v.timestampValue).getTime();
  if ('mapValue' in v) {
    const fields = v.mapValue.fields || {};
    const res: any = {};
    for (const [k, val] of Object.entries(fields)) {
      res[k] = decodeValue(val);
    }
    return res;
  }
  if ('arrayValue' in v) {
    const values = v.arrayValue.values || [];
    return values.map(decodeValue);
  }
  return v;
}

function decodeDoc(doc: any): any {
  if (!doc) return null;
  const id = doc.name ? doc.name.split('/').pop() : undefined;
  const data: any = { id };
  if (doc.fields) {
    for (const [k, val] of Object.entries(doc.fields)) {
      data[k] = decodeValue(val);
    }
  }
  return data;
}

export async function getFirestoreDoc(collection: string, docId: string): Promise<any | null> {
  const res = await fetch(`${BASE_URL}/${collection}/${docId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore get error: ${res.status}`);
  const json = await res.json();
  return decodeDoc(json);
}

export async function queryFirestore(collectionId: string, fieldFilter?: { field: string; op: 'EQUAL'; value: any }): Promise<any[]> {
  const query: any = {
    structuredQuery: {
      from: [{ collectionId }],
    },
  };

  if (fieldFilter) {
    let valObj: any = { stringValue: String(fieldFilter.value) };
    if (typeof fieldFilter.value === 'number') valObj = { integerValue: String(fieldFilter.value) };
    if (typeof fieldFilter.value === 'boolean') valObj = { booleanValue: fieldFilter.value };

    query.structuredQuery.where = {
      fieldFilter: {
        field: { fieldPath: fieldFilter.field },
        op: fieldFilter.op,
        value: valObj,
      },
    };
  }

  const res = await fetch(`${BASE_URL}:runQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });

  if (!res.ok) throw new Error(`Query failed: ${res.status}`);
  const results = await res.json();
  return results
    .filter((r: any) => r.document)
    .map((r: any) => decodeDoc(r.document));
}
