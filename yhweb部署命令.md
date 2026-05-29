# YHthestudio 网站部署命令备忘

> 以下路径请改成你服务器上的**实际项目目录**（示例：`/www/wwwroot/yhthestudio.com/official-website-modification_v0.1.2`）。  
> 部署前确认：`ecosystem.config.js` 里的 `cwd`、`yh-py` 的 `script`（`.venv/bin/uvicorn`）与服务器路径一致。

---

## 1. 进入项目目录

```bash
cd /www/wwwroot/你的域名/official-website-modification_v0.1.2
```

---

## 2. 安装 Node 依赖并构建前端

> 若使用 npmmirror 出现 `esbuild` 404，请**务必**指定官方源安装。  
> `npm run build` 只依赖 Node，**不依赖** Python；但完整上线仍需后面步骤。

```bash
rm -rf node_modules
npm cache clean --force
npm install --registry=https://registry.npmjs.org/ --foreground-scripts
npm run build
```

构建成功后产物在 **`dist/`**，由 `api-server.js` 对外提供静态页面。

---

## 3. Python 虚拟环境与依赖（数据库 / RPC 后端）

> OpenCloudOS / CentOS 等若提示 `pip: command not found`，先装系统包，再用 **`python -m pip`**（见下方「pip 不可用」）。

```bash
# 系统级 Python（首次部署必装）
dnf install -y python3 python3-pip python3-devel
# 或：yum install -y python3 python3-pip python3-devel

python3 -m venv .venv
source .venv/bin/activate

# 推荐：不要直接敲 pip，用 python -m pip
python -m ensurepip --upgrade
python -m pip install -U pip
python -m pip install -r py_backend/requirements.txt
deactivate
```

### pip 不可用 / `bash: pip: command not found`

1. 确认在 venv 里且用模块方式安装：

```bash
cd /www/wwwroot/你的域名/official-website-modification_v0.1.2
source .venv/bin/activate
python -m pip install -U pip
python -m pip install pymysql
python -m pip install -r py_backend/requirements.txt
```

2. 若仍报错，删除 venv 重建：

```bash
deactivate 2>/dev/null || true
rm -rf .venv
dnf install -y python3 python3-pip python3-devel
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -U pip
python -m pip install -r py_backend/requirements.txt
```

3. 不激活 venv 也可（路径按实际项目目录改）：

```bash
.venv/bin/python -m pip install -r py_backend/requirements.txt
```

---

## 4. PM2 启动 / 更新进程

> 项目需要 **两个进程**：`yh-py`（Uvicorn 5100）、`yh-api`（Node 3000）。  
> 首次或改配置后可用下面整套；日常仅更新代码可先 `build` 再 `pm2 restart`。

```bash
pm2 delete yh-api yh-py 2>/dev/null || true
pm2 start ecosystem.config.js --env production
pm2 save
```

仅重启 Node（例如刚跑完 `npm run build`、只更新了前端）：

```bash
pm2 restart yh-api
```

（可选）开机自启，按 `pm2 startup` 提示执行一次系统命令后再 `pm2 save`。

---

## 5. 宝塔 / Nginx 简要说明

- 浏览器访问：**反代到 `http://127.0.0.1:3000`**（Node），**不要**把整站指到 5100（Python 只给 Node 用）。
- 大文件上传：站点需足够大的 `client_max_body_size` 与 `proxy_*_timeout`（与之前 Nginx 调优一致）。
- 改 Nginx 后：**重载 Nginx**。

---

## 6. 验证

```bash
curl -I http://127.0.0.1:3000
curl -I http://127.0.0.1:5100/health
pm2 list
pm2 logs yh-api --lines 30
pm2 logs yh-py --lines 30
```

浏览器打开站点后建议 **强制刷新**（避免旧 `index.html` / JS 缓存）。

---

## 7. 可选：消除 npm 的 `--init.module` 警告

若安装时出现 `Unknown global config "--init.module"`，在服务器搜索并编辑对应 `.npmrc` 删除无效行：

```bash
grep -rn "init.module" /root/.npmrc /www/server/nodejs 2>/dev/null
```
