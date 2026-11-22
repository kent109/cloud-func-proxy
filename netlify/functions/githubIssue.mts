// netlify/functions/githubIssue.mts
import type { Context, Config } from "@netlify/functions";

/** 统一构造 JSON 返回 */
function json(statusCode: number, obj: unknown): Response {
  return new Response(JSON.stringify(obj), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });
}

export default async (req: Request, context: Context) => {
  const startedAt = Date.now();
  console.log("[githubIssue] 请求开始", {
    method: req.method,
    url: req.url,
    requestId: context.requestId,
  });

  if (req.method !== "POST") {
    console.warn(`[githubIssue] 方法不允许: ${req.method}`);
    return json(405, { code: -1, msg: "Only POST method is allowed" });
  }

  // 1. 解析请求体（兼容空 body）
  const rawBody = await req.text();
  console.log("[githubIssue] 原始请求体:", rawBody);

  let body: Record<string, string | undefined> = {};
  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      console.error("[githubIssue] 请求体解析失败:", e);
      return json(400, { code: -1, msg: "Invalid request body" });
    }
  }
  console.log("[githubIssue] 解析后的参数:", body);

  // 2. 取出参数
  const title = body.title || "用户反馈";
  const content = body.content || "";
  const contact = body.contact || "";
  const deviceInfo = body.deviceInfo || "";
  const assignee = body.assignee || null;
  console.log("[githubIssue] 参数提取完成", { title, assignee });

  // 3. 从环境变量读取配置
  const githubToken = process.env.GITHUB_TOKEN;
  const repoOwner = "kent109";
  const repoName = "UnicornPlayer";
  console.log("[githubIssue] 环境变量检查", {
    hasGithubToken: Boolean(githubToken),
    repoOwner,
    repoName,
  });
  if (!githubToken) {
    console.warn("[githubIssue] 未配置 GITHUB_TOKEN，GitHub API 将返回 401");
  }

  // 4. 构造 Issue 内容
  const issueBody = [
    `问题标题：${title}`,
    "",
    `反馈内容：${content}`,
    "",
    `联系方式：${contact}`,
    "",
    `设备信息：${deviceInfo}`,
  ].join("\n");

  // 5. 调用 GitHub API 创建 Issue
  const url = `https://api.github.com/repos/${repoOwner}/${repoName}/issues`;
  const headers = {
    Authorization: `token ${githubToken}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "MyAppFeedback",
    "Content-Type": "application/json",
  };
  const payload: Record<string, unknown> = { title, body: issueBody };
  if (assignee) payload.assignee = assignee;
  console.log("[githubIssue] 请求 GitHub", { url, payload });

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const respText = await resp.text();
    console.log("[githubIssue] GitHub 响应", {
      status: resp.status,
      costMs: Date.now() - startedAt,
      body: respText.slice(0, 500),
    });

    if (resp.status === 201) {
      let issueUrl: string | undefined;
      try {
        issueUrl = JSON.parse(respText).html_url;
      } catch {
        /* 忽略非 JSON 响应 */
      }
      console.log("[githubIssue] Issue 创建成功:", issueUrl);
      return json(200, { code: 0, msg: "反馈成功", issue_url: issueUrl });
    }

    console.error(`[githubIssue] GitHub API 错误: ${resp.status} ${respText}`);
    return json(500, {
      code: -1,
      msg: `创建失败: ${resp.status}`,
      detail: respText,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[githubIssue] 请求异常:", message);
    return json(500, { code: -1, msg: `内部错误: ${message}` });
  }
};
