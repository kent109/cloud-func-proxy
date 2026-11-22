'use strict';

const https = require('https');

console.log('Loading function');

/**
 * 发送 JSON POST 请求（基于 Node.js 内置 https，无需第三方依赖）
 * @returns {Promise<{status: number, text: string, json: object|null}>}
 */
function postJson(url, payload, headers) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(payload), 'utf8');
    const req = https.request(url, {
      method: 'POST',
      headers: Object.assign({}, headers, { 'Content-Length': data.length })
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (e) { /* 非 JSON 响应 */ }
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('request timeout')));
    req.write(data);
    req.end();
  });
}

/** 统一构造云函数返回结构 */
function response(statusCode, obj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
  };
}

/**
 * 云函数入口
 */
exports.handler = async (event, context) => {
  console.log('start handler');

  // 1. 获取 HTTP 方法（httpMethod 在 event 顶层）
  const httpMethod = (event && event.httpMethod) || '';
  if (httpMethod !== 'POST') {
    return response(405, { code: -1, msg: 'Only POST method is allowed' });
  }

  // 2. 解析请求体（兼容 body 为字符串或对象）
  let body;
  try {
    const raw = (event && event.body) || '{}';
    body = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    return response(400, { code: -1, msg: 'Invalid request body' });
  }

  // 3. 取出参数
  const title = body.title || '用户反馈';
  const content = body.content || '';
  const contact = body.contact || '';
  const deviceInfo = body.deviceInfo || '';
  const assignee = body.assignee || null;

  // 4. 从环境变量读取配置
  const githubToken = process.env.GITHUB_TOKEN;
  const repoOwner = 'kent109';
  const repoName = 'UnicornPlayer';

  // 5. 构造 Issue 内容
  const issueBody = [
    `问题标题：${title}`,
    '',
    `反馈内容：${content}`,
    '',
    `联系方式：${contact}`,
    '',
    `设备信息：${deviceInfo}`
  ].join('\n');

  // 6. 调用 GitHub API 创建 Issue
  const url = `https://api.github.com/repos/${repoOwner}/${repoName}/issues`;
  const headers = {
    'Authorization': `token ${githubToken}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'MyAppFeedback', // GitHub 要求必须带 User-Agent
    'Content-Type': 'application/json'
  };
  const payload = { title, body: issueBody };
  if (assignee) payload.assignee = assignee;

  try {
    const resp = await postJson(url, payload, headers);
    if (resp.status === 201) {
      const issueUrl = resp.json && resp.json.html_url;
      console.log(`GitHub Issue created: ${issueUrl}`);
      return response(200, { code: 0, msg: '反馈成功', issue_url: issueUrl });
    }
    console.error(`GitHub API error: ${resp.status} ${resp.text}`);
    return response(500, {
      code: -1,
      msg: `创建失败: ${resp.status}`,
      detail: resp.text
    });
  } catch (e) {
    console.error(`Exception: ${e.message}`);
    return response(500, { code: -1, msg: `内部错误: ${e.message}` });
  }
};
