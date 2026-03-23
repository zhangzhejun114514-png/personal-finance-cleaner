# 个人财务流水清洗器

一个用于清洗和分析个人财务流水的工具，支持支付宝和微信账单的解析和分类，使用 AI 进行智能分类。

## 功能特性

- 支持上传 CSV 和 XLSX 格式的账单文件
- 自动解析支付宝和微信账单
- **文档级 AI 智能分类**：将整个文档直接交给 AI 进行分类，提高分类准确性和一致性
- 生成消费结构统计图表
- 将数据存储到 Supabase 数据库
- 支持实时数据存储和查询
- AI 理财建议功能：根据用户的理财目标和具体问题，提供个性化的理财建议

## 技术栈

- 前端：HTML、CSS、JavaScript、Tailwind CSS、Chart.js
- 后端：Node.js、Express
- 数据库：Supabase
- 文件处理：multer、csv-parser、xlsx
- AI 集成：智谱 AI API
- 部署：EdgeOne

## 快速开始

### 安装依赖

```bash
npm install
```

### 配置环境变量

创建 `.env` 文件，添加以下内容：

```env
# Supabase 配置
SUPABASE_URL=your-supabase-url
SUPABASE_KEY=your-supabase-key

# 智谱 AI 配置
ZHIPU_API_KEY=your-zhipu-api-key
```

### 启动服务器

```bash
node server/server.js
```

### 访问应用

打开浏览器，访问 `http://localhost:3000`

## 使用方法

1. **上传账单文件**：选择支付宝或微信导出的账单文件（CSV 或 XLSX 格式）
2. **点击上传按钮**：系统会自动解析文件并将整个文档交给 AI 进行分类
3. **查看处理结果**：包括交易明细、消费分类占比等
4. **获取理财建议**：选择理财目标，输入具体问题，获取 AI 提供的个性化理财建议
5. **数据存储**：处理后的数据会自动存储到 Supabase 数据库

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

1. **将代码推送到 GitHub**
   ```bash
   git add .
   git commit -m "更新代码"
   git push -u origin main
   ```

2. **登录 EdgeOne 控制台**
   - 打开腾讯云控制台，进入 EdgeOne 服务
   - 点击 "新建站点"

3. **配置部署**
   - 选择 "GitHub" 作为部署源
   - 选择你的 GitHub 仓库
   - 配置构建命令：`npm install`
   - 配置启动命令：`node server/server.js`

4. **配置环境变量**
   - 在 EdgeOne 控制台中，找到 "环境变量" 配置
   - 添加以下环境变量：
     - `SUPABASE_URL`：你的 Supabase 项目 URL
     - `SUPABASE_KEY`：你的 Supabase 项目密钥
     - `ZHIPU_API_KEY`：你的智谱 AI API Key

5. **部署应用**
   - 点击 "部署" 按钮
   - 等待部署完成
   - 复制生成的公网 URL

## 注意事项

- 确保 Supabase 项目已经正确配置
- 确保环境变量已经正确设置
- 确保 Supabase 数据库表结构已经创建
- 对于微信和支付宝账单，系统会自动识别并解析
- 确保智谱 AI API Key 已经正确配置，否则 AI 分类和理财建议功能将无法使用
- 文档级 AI 分类可能会消耗较多的 API 调用次数，请确保智谱 AI API 有足够的配额

## 许可证

MIT