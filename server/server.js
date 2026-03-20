const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');


const app = express();
const port = 3000;

// 初始化 Supabase 客户端
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// 设置静态文件目录
app.use(express.static(path.join(__dirname, '../public')));

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

// 启动服务器
app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
});