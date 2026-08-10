# 推送到 GitHub（需你本机登录一次）

本地仓库已完成首次 commit（`main`），密钥文件已在 `.gitignore` 中排除。

## 1. 登录 GitHub CLI

在 PowerShell：

```powershell
gh auth login -h github.com -p https -w
```

按提示在浏览器完成授权。

## 2. 创建公开仓并推送

```powershell
cd C:\Users\jensenfang\Downloads\family-office-platform-master
gh repo create heyu --public --source=. --remote=origin --push
```

若仓库已在网页上建好、为空：

```powershell
git remote add origin https://github.com/fangjg16/heyu.git
git push -u origin main
```

## 3. 打开 Pages

1. https://github.com/fangjg16/heyu/settings/pages → Source = **GitHub Actions**
2. 有 API 地址后：Settings → Secrets → Actions → `VITE_AI_CHAT_ENDPOINT` = `https://你的隧道/api/chat`
3. Actions → Deploy GitHub Pages → Run workflow

前端地址：https://fangjg16.github.io/heyu/
