# 视频素材分析平台

支持 Excel 导入、日期筛选、素材汇总、图表展示、Excel 导出，以及通过后端安全同步 Supabase。

## 架构

`网页 → Node 后端接口 → Supabase REST API → PostgreSQL`

浏览器不会接触 Supabase Secret Key。数据仍会写入 `localStorage`，云端不可用时可以继续查看本地缓存。

## 创建 Supabase 项目

1. 在 [Supabase](https://supabase.com/) 创建项目。
2. 打开项目的 **SQL Editor**。
3. 执行仓库中的 `supabase.sql`。
4. 在 **Settings → API Keys** 获取 Secret Key；旧项目也可能显示为 `service_role` key。
5. 在 **Integrations → Data API** 获取项目 URL。

## 配置

复制 `.env.example` 为 `.env`：

```env
PORT=3000
SUPABASE_URL=https://你的项目编号.supabase.co
SUPABASE_SECRET_KEY=你的SecretKey
SUPABASE_TABLE=app_state
```

不要把 `.env` 或 Secret Key 提交到 GitHub。

## 本地运行

需要 Node.js 18 或更高版本：

```powershell
npm start
```

访问 `http://localhost:3000`。不要再通过 `file://` 直接打开，否则无法调用后端。

## 部署到 Render

仓库中的 `render.yaml` 已包含 Web Service 配置。

1. 将代码推送到 GitHub。
2. 登录 [Render](https://dashboard.render.com/)。
3. 点击 **New → Blueprint**，连接 `qiufenqwer/toufan`。
4. Render 会自动读取 `render.yaml`。
5. 填写 `SUPABASE_URL` 和 `SUPABASE_SECRET_KEY`。
6. 点击部署，完成后使用 Render 提供的 `onrender.com` 地址。

## 数据模型

当前使用 `app_state` 表中的一条 `default` 记录保存完整网页状态：

- `id`：固定为 `default`
- `data`：网页数据，类型为 `jsonb`
- `updated_at`：最后同步时间

后续如需多人登录、历史版本或逐条素材编辑，可再拆分为标准数据表。
