import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = fileURLToPath(new URL('.', import.meta.url));
try {
  const environmentFile = await readFile(join(rootDirectory, '.env'), 'utf8');
  environmentFile.split(/\r?\n/).forEach(line => {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) return;
    const separatorIndex = trimmedLine.indexOf('=');
    if (separatorIndex === -1) return;
    const key = trimmedLine.slice(0, separatorIndex).trim();
    const value = trimmedLine.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  });
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const port = Number(process.env.PORT || 3000);

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8'
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 10 * 1024 * 1024) {
      throw new Error('请求数据超过 10MB 限制');
    }
  }
  return body ? JSON.parse(body) : {};
}

function requireEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}

function getSupabaseConfiguration() {
  const projectUrl = requireEnvironment('SUPABASE_URL').replace(/\/$/, '');
  const secretKey = requireEnvironment('SUPABASE_SECRET_KEY');
  const table = process.env.SUPABASE_TABLE || 'app_state';
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(projectUrl)) {
    throw new Error('SUPABASE_URL 格式错误，应类似 https://xxxx.supabase.co');
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
    throw new Error('SUPABASE_TABLE 格式无效');
  }
  return {
    endpoint: `${projectUrl}/rest/v1/${table}`,
    secretKey
  };
}

async function fetchSupabaseJson(url, options) {
  let supabaseHost = 'unknown';
  try {
    supabaseHost = new URL(url).host;
    const response = await fetch(url, options);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.message || result.hint || `Supabase 接口返回 ${response.status}`);
    }
    return result;
  } catch (error) {
    if (error.message?.startsWith('Supabase 接口返回')) throw error;
    const cause = error.cause?.code || error.cause?.message || error.message;
    throw new Error(`无法连接 Supabase（${supabaseHost}）：${cause}`);
  }
}

async function requestSupabase(method, payload) {
  const { endpoint, secretKey } = getSupabaseConfiguration();
  const isRead = method === 'GET';
  const result = await fetchSupabaseJson(endpoint, {
    method,
    headers: {
      'content-type': 'application/json',
      apikey: secretKey,
      authorization: `Bearer ${secretKey}`,
      prefer: isRead ? 'return=representation' : 'resolution=merge-duplicates,return=representation'
    },
    body: isRead ? undefined : JSON.stringify({
      id: 'default',
      data: payload.data,
      updated_at: new Date().toISOString()
    })
  });
  if (isRead) {
    const row = Array.isArray(result) ? result[0] : null;
    return { data: row?.data || null, updatedAt: row?.updated_at || null };
  }
  return { data: payload.data, updatedAt: result[0]?.updated_at || null };
}

async function handleApi(request, response) {
  try {
    if (request.method === 'GET') {
      const { endpoint, secretKey } = getSupabaseConfiguration();
      const rows = await fetchSupabaseJson(
        `${endpoint}?id=eq.default&select=data,updated_at&limit=1`,
        {
          headers: {
            apikey: secretKey,
            authorization: `Bearer ${secretKey}`
          }
        }
      );
      const row = rows[0];
      sendJson(response, 200, {
        data: row?.data || null,
        updatedAt: row?.updated_at || null
      });
      return;
    }
    if (request.method === 'PUT') {
      const payload = await readJson(request);
      if (!payload.data || typeof payload.data !== 'object') {
        sendJson(response, 400, { message: '缺少 data 字段' });
        return;
      }
      const result = await requestSupabase('POST', payload);
      sendJson(response, 200, result);
      return;
    }
    sendJson(response, 405, { message: '仅支持 GET 和 PUT' });
  } catch (error) {
    sendJson(response, 500, { message: error.message });
  }
}

async function serveStatic(request, response) {
  const requestPath = new URL(request.url, 'http://localhost').pathname;
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.slice(1);
  const safePath = normalize(relativePath).replace(/^(\.\.[/\\])+/, '');
  try {
    const filePath = join(rootDirectory, safePath);
    const contents = await readFile(filePath);
    response.writeHead(200, {
      'content-type': contentTypes[extname(filePath)] || 'application/octet-stream'
    });
    response.end(contents);
  } catch {
    sendJson(response, 404, { message: '文件不存在' });
  }
}

createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }
  if (pathname === '/api/data') {
    await handleApi(request, response);
    return;
  }
  await serveStatic(request, response);
}).listen(port, () => {
  console.log(`素材分析平台已启动：http://localhost:${port}`);
});
