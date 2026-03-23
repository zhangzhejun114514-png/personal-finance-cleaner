const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const axios = require('axios');


const app = express();
const port = 3000;

// 初始化 Supabase 客户端
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// 设置静态文件目录
app.use(express.static(path.join(__dirname, '../public')));

// 解析 JSON 请求体
app.use(express.json());

// 配置 multer 存储
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage });

// AI 分类函数
function categorizeTransaction(description, originalCategory) {
    // 简单的分类规则，可以根据实际需求扩展
    const categories = {
        '餐饮': ['吃饭', '餐厅', '饭店', '美食', '外卖', '餐饮'],
        '购物': ['购物', '超市', '商城', '淘宝', '京东', '天猫'],
        '交通': ['打车', '公交', '地铁', '加油', '停车', '交通'],
        '娱乐': ['电影', '游戏', '娱乐', '休闲', '旅游', '景点'],
        '生活': ['生活', '日常', '家居', '水电', '物业', '房租'],
        '医疗': ['医院', '药店', '医疗', '健康'],
        '教育': ['教育', '学习', '培训', '学校', '书籍'],
        '其他': []
    };
    
    // 确保 description 和 originalCategory 是字符串
    description = description || '';
    originalCategory = originalCategory || '';
    
    // 优先根据交易描述分类
    for (const [category, keywords] of Object.entries(categories)) {
        if (keywords.some(keyword => description.includes(keyword))) {
            return category;
        }
    }
    
    // 其次根据原始分类
    for (const [category, keywords] of Object.entries(categories)) {
        if (keywords.some(keyword => originalCategory.includes(keyword))) {
            return category;
        }
    }
    
    return '其他';
}

// 上传处理
app.post('/api/upload', upload.single('csvFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: '请选择文件' });
    }
    
    const filePath = req.file.path;
    const transactions = [];
    const expenseCategories = {};
    let totalTransactions = 0;
    let totalAmount = 0;
    let totalIncome = 0;
    
    try {
        // 根据文件扩展名判断文件类型
        const fileExtension = path.extname(req.file.originalname).toLowerCase();
        
        if (fileExtension === '.csv') {
            // 解析 CSV 文件
            await new Promise((resolve, reject) => {
                fs.createReadStream(filePath)
                    .pipe(csv())
                    .on('data', (row) => {
                        let transaction;
                        
                        // 检查是否是微信账单格式
                        if (row['交易时间'] && row['交易类型'] && row['交易对方'] && row['金额(元)']) {
                            // 微信账单格式
                            transaction = {
                                time: row['交易时间'] || '',
                                amount: parseFloat(row['金额(元)']) * (row['收/支'] === '支出' ? -1 : 1) || 0,
                                description: row['商品'] || row['交易对方'] || '未描述',
                                originalCategory: row['交易类型'] || '未分类'
                            };
                        } else {
                            // 支付宝账单格式
                            transaction = {
                                time: row['交易时间'] || row['时间'] || '',
                                amount: parseFloat(row['金额']) || parseFloat(row['交易金额']) || 0,
                                description: row['交易描述'] || row['商品说明'] || row['描述'] || '未描述',
                                originalCategory: row['分类'] || row['交易分类'] || '未分类'
                            };
                        }
                        
                        // 计算总金额
                        if (transaction.amount < 0) {
                            totalAmount += Math.abs(transaction.amount);
                        } else {
                            totalIncome += transaction.amount;
                        }
                        
                        // AI 自动分类
                        transaction.aiCategory = categorizeTransaction(transaction.description, transaction.originalCategory);
                        
                        // 统计消费分类
                        if (transaction.amount < 0) {
                            const category = transaction.aiCategory;
                            if (!expenseCategories[category]) {
                                expenseCategories[category] = 0;
                            }
                            expenseCategories[category] += Math.abs(transaction.amount);
                        }
                        
                        transactions.push(transaction);
                        totalTransactions++;
                    })
                    .on('end', () => {
                        resolve();
                    })
                    .on('error', (error) => {
                        reject(error);
                    });
            });
        } else if (fileExtension === '.xlsx') {
            // 解析 XLSX 文件
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(worksheet);
            
            rows.forEach((row, index) => {
                // 输出前几行数据，查看实际的字段名称
                if (index < 2) {
                    console.log('XLSX 行数据:', row);
                }
                
                let transaction;
                
                // 检查是否是微信账单格式
                if (row['交易时间'] && (row['交易类型'] || row['类型']) && (row['交易对方'] || row['对方']) && (row['金额(元)'] || row['金额'])) {
                    // 微信账单格式
                    transaction = {
                        time: row['交易时间'] || '',
                        amount: parseFloat(row['金额(元)'] || row['金额']) * (row['收/支'] === '支出' ? -1 : 1) || 0,
                        description: row['商品'] || row['交易对方'] || row['对方'] || '未描述',
                        originalCategory: row['交易类型'] || row['类型'] || '未分类'
                    };
                } else {
                    // 支付宝账单格式
                    transaction = {
                        time: row['交易时间'] || row['时间'] || '',
                        amount: parseFloat(row['金额']) || parseFloat(row['交易金额']) || 0,
                        description: row['交易描述'] || row['商品说明'] || row['描述'] || '未描述',
                        originalCategory: row['分类'] || row['交易分类'] || '未分类'
                    };
                }
                
                // 计算总金额
                if (transaction.amount < 0) {
                    totalAmount += Math.abs(transaction.amount);
                } else {
                    totalIncome += transaction.amount;
                }
                
                // AI 自动分类
                transaction.aiCategory = categorizeTransaction(transaction.description, transaction.originalCategory);
                
                // 统计消费分类
                if (transaction.amount < 0) {
                    const category = transaction.aiCategory;
                    if (!expenseCategories[category]) {
                        expenseCategories[category] = 0;
                    }
                    expenseCategories[category] += Math.abs(transaction.amount);
                }
                
                transactions.push(transaction);
                totalTransactions++;
            });
            
            console.log('XLSX 解析完成，共解析', totalTransactions, '条记录');
        } else {
            throw new Error('不支持的文件格式，请上传 CSV 或 XLSX 文件');
        }
        
        // 删除临时文件
        fs.unlinkSync(filePath);
        
        try {
            // 将交易数据存储到 Supabase
            if (transactions.length > 0) {
                console.log('准备存储', transactions.length, '条交易记录到 Supabase');
                console.log('第一条交易记录:', transactions[0]);
                
                // 分批插入数据，避免一次性插入过多数据
                const batchSize = 100;
                for (let i = 0; i < transactions.length; i += batchSize) {
                    const batch = transactions.slice(i, i + batchSize);
                    console.log('存储批次:', i / batchSize + 1, '，记录数:', batch.length);
                    
                    const { error } = await supabase
                        .from('personal_transactions')
                        .insert(batch.map(transaction => ({
                            time: transaction.time,
                            amount: transaction.amount,
                            description: transaction.description,
                            original_category: transaction.originalCategory,
                            custom_category: transaction.aiCategory
                        })));
                    
                    if (error) {
                        console.error('存储数据到 Supabase 失败:', error);
                        // 继续处理，不中断整个流程
                    } else {
                        console.log('批次存储成功');
                    }
                }
                console.log(`成功存储 ${transactions.length} 条交易记录到 Supabase`);
            }
        } catch (error) {
            console.error('存储数据到 Supabase 失败:', error);
            // 继续处理，不中断整个流程
        }
        
        // 返回处理结果
        res.json({
            totalTransactions: totalTransactions || 0,
            totalAmount: totalAmount || 0,
            totalIncome: totalIncome || 0,
            expenseCategories: expenseCategories || {},
            transactions: transactions || []
        });
    } catch (error) {
        // 删除临时文件
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        
        res.status(500).json({ error: '解析文件失败: ' + error.message });
    }
});

// 测试路由：发送测试数据到 Supabase
app.get('/api/test-supabase', async (req, res) => {
    try {
        // 创建测试数据
        const testTransactions = [
            {
                time: new Date().toISOString(),
                amount: -100.50,
                description: '测试消费1',
                original_category: '餐饮',
                custom_category: '餐饮'
            },
            {
                time: new Date().toISOString(),
                amount: -50.00,
                description: '测试消费2',
                original_category: '购物',
                custom_category: '购物'
            },
            {
                time: new Date().toISOString(),
                amount: 200.00,
                description: '测试收入',
                original_category: '其他',
                custom_category: '其他'
            }
        ];
        
        // 存储测试数据到 Supabase
        if (testTransactions.length > 0) {
            const { error } = await supabase
                .from('personal_transactions')
                .insert(testTransactions);
            
            if (error) {
                console.error('存储测试数据到 Supabase 失败:', error);
                return res.status(500).json({
                    error: '存储测试数据失败',
                    details: error.message
                });
            }
            
            console.log(`成功存储 ${testTransactions.length} 条测试记录到 Supabase`);
            res.json({
                success: true,
                message: `成功存储 ${testTransactions.length} 条测试记录到 Supabase`,
                data: testTransactions
            });
        } else {
            res.json({
                success: false,
                message: '没有测试数据'
            });
        }
    } catch (error) {
        console.error('测试 Supabase 失败:', error);
        res.status(500).json({
            error: '测试失败',
            details: error.message
        });
    }
});

// AI 理财建议路由
app.post('/api/financial-advice', async (req, res) => {
    try {
        const { financialGoal, financialQuestion } = req.body;
        
        // 验证请求参数
        if (!financialGoal) {
            return res.status(400).json({ error: '请选择理财目标' });
        }
        
        // 构建 System Prompt
        const systemPrompt = `你是一位专业的理财顾问，擅长为个人提供合理的理财建议。

角色定义：
- 你是一位经验丰富的理财顾问，拥有专业的金融知识和丰富的实践经验
- 你能够根据用户的理财目标和具体问题，提供个性化的理财建议
- 你的建议应该基于专业知识，同时考虑用户的实际情况

行为约束：
- 提供的建议应该具体、实用、可操作
- 避免使用过于专业的术语，确保用户能够理解
- 建议应该合理、平衡，考虑风险和收益
- 不要提供投资建议，只提供理财规划和预算管理方面的建议

输出格式：
- 直接输出理财建议，不要有任何引言或开场白
- 建议应该分点列出，每点简洁明了
- 总长度控制在 200-300 字之间`;
        
        // 构建用户消息
        let userMessage = `我的理财目标是：${financialGoal}`;
        if (financialQuestion) {
            userMessage += `\n我的具体问题是：${financialQuestion}`;
        }
        
        // 调用智谱 AI API
        const zhipuApiKey = process.env.ZHIPU_API_KEY;
        let advice;
        
        if (!zhipuApiKey) {
            // 如果 API Key 未配置，使用模拟数据
            console.log('智谱 AI API Key 未配置，使用模拟数据');
            advice = getMockAdvice(financialGoal, financialQuestion);
        } else {
            try {
                const response = await axios.post(
                    'https://api.zhipuai.cn/v3/chat/completions',
                    {
                        model: 'glm-4',
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userMessage }
                        ],
                        temperature: 0.7,
                        max_tokens: 500
                    },
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${zhipuApiKey}`
                        },
                        timeout: 15000 // 添加 15 秒超时
                    }
                );
                
                // 打印响应数据，了解实际格式
                console.log('智谱 AI API 响应:', JSON.stringify(response.data, null, 2));
                
                // 提取理财建议
                if (response.data && response.data.choices && response.data.choices.length > 0) {
                    advice = response.data.choices[0].message.content;
                } else {
                    throw new Error('智谱 AI API 返回的响应格式不正确');
                }
            } catch (apiError) {
                console.error('获取理财建议失败:', apiError);
                console.error('错误详情:', apiError.response ? apiError.response.data : apiError);
                // 如果 API 调用失败，使用模拟数据
                console.log('API 调用失败，使用模拟数据');
                advice = getMockAdvice(financialGoal, financialQuestion);
            }
        }
        
        // 返回结果
        res.json({ advice });
        
    } catch (error) {
        console.error('获取理财建议失败:', error);
        res.status(500).json({ 
            error: '获取理财建议失败',
            details: error.message
        });
    }
});

// 模拟理财建议函数
function getMockAdvice(financialGoal, financialQuestion) {
    const mockAdvices = {
        'save': {
            default: `1. 建立紧急备用金：建议将3-6个月的生活费存入活期或货币基金，确保资金流动性。
2. 制定月度预算：记录所有收入和支出，控制非必要开支，将每月结余的30%以上用于储蓄。
3. 利用复利效应：选择合适的储蓄产品，如定期存款、国债等，长期坚持储蓄，享受复利带来的收益。
4. 自动化储蓄：设置工资自动转账到储蓄账户，减少手动操作的惰性。`,
            '如何优化消费结构': `1. 分类消费：将支出分为必要支出（如房租、水电费）、重要支出（如教育、医疗）和非必要支出（如娱乐、购物）。
2. 控制非必要支出：设定每月非必要支出的上限，如不超过月收入的20%。
3. 比价购物：购买商品前多比较价格，利用优惠券和促销活动，避免冲动消费。
4. 定期复盘：每月分析消费记录，找出可以进一步优化的支出项目。`
        },
        'invest': {
            default: `1. 风险评估：根据个人风险承受能力，选择合适的投资产品，如股票、基金、债券等。
2. 资产配置：分散投资，不要将所有资金投入单一资产，建议配置不同风险等级的投资产品。
3. 长期投资：投资是一个长期过程，避免频繁交易，坚持长期持有优质资产。
4. 定期学习：了解基本的投资知识，关注市场动态，做出理性的投资决策。`
        },
        'budget': {
            default: `1. 制定详细预算：将每月收入按比例分配到不同的支出类别，如住房、交通、饮食、娱乐等。
2. 跟踪支出：使用记账软件或手动记录每笔支出，确保实际支出不超过预算。
3. 调整预算：根据实际情况定期调整预算，如季节性支出增加时适当调整相关类别的预算。
4. 设定目标：为大额支出设定储蓄目标，如旅行、购买大件物品等，提前规划资金。`
        },
        'debt': {
            default: `1. 整理债务：列出所有债务，包括金额、利率、还款期限等信息。
2. 优先还款：优先偿还高利率债务，如信用卡欠款，减少利息支出。
3. 制定还款计划：根据收入情况，制定合理的还款计划，确保按时还款，避免逾期。
4. 避免新债务：在还清现有债务前，尽量避免产生新的债务，如不必要的信用卡消费。`
        }
    };
    
    // 查找对应目标的建议
    if (mockAdvices[financialGoal]) {
        // 如果有具体问题，查找对应问题的建议
        if (financialQuestion && mockAdvices[financialGoal][financialQuestion]) {
            return mockAdvices[financialGoal][financialQuestion];
        }
        // 否则返回默认建议
        return mockAdvices[financialGoal].default || mockAdvices[financialGoal];
    }
    
    // 默认建议
    return `1. 建立预算：制定月度预算，跟踪收入和支出，控制非必要开支。
2. 储蓄计划：每月将固定比例的收入存入储蓄账户，建立紧急备用金。
3. 债务管理：优先偿还高利率债务，避免逾期产生额外费用。
4. 长期规划：根据个人目标，制定长期理财计划，如退休储蓄、子女教育基金等。`;
}

// 启动服务器
app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
});