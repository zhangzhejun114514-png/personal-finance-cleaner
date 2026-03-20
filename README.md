# 个人财务流水清洗器

一个用于清洗和分析个人财务流水的工具，支持支付宝和微信账单的解析和分类。

## 功能特性

- 支持上传 CSV 和 XLSX 格式的账单文件
- 自动解析支付宝和微信账单
- AI 自动分类消费类型
- 生成消费结构统计图表
- 将数据存储到 Supabase 数据库
- 支持实时数据存储和查询

## 技术栈

- 前端：HTML、CSS、JavaScript、Tailwind CSS、Chart.js
- 后端：Node.js、Express
- 数据库：Supabase
- 文件处理：multer、csv-parser、xlsx

## 快速开始

### 安装依赖

```bash
npm install
```

### 配置环境变量

创建 `.env` 文件，添加以下内容：

```env
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 启动服务器

```bash
node server/server.js
```

### 访问应用

打开浏览器，访问 `http://localhost:3000`

## 使用方法

1. 上传支付宝或微信导出的账单文件（CSV 或 XLSX 格式）
2. 点击 "开始处理" 按钮
3. 查看处理结果，包括交易明细、消费分类占比等
4. 数据会自动存储到 Supabase 数据库

## 数据库结构

```sql
CREATE TABLE personal_transactions (
   id SERIAL PRIMARY KEY,
   time TEXT NOT NULL,
   amount DECIMAL(10, 2) NOT NULL,
   description TEXT NOT NULL,
   original_category TEXT NOT NULL,
   custom_category TEXT NOT NULL,
   created_at TIMESTAMP DEFAULT NOW()
);
```

## 部署

### 部署到 EdgeOne

1. 将代码推送到 GitHub
2. 登录 EdgeOne 控制台
3. 创建新应用，选择 GitHub 作为部署源
4. 配置构建和启动命令
5. 部署应用

## 注意事项

- 确保 Supabase 项目已经正确配置
- 确保环境变量已经正确设置
- 确保 Supabase 数据库表结构已经创建
- 对于微信和支付宝账单，系统会自动识别并解析

## 许可证

MIT
