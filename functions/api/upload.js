export async function onRequest(context) {
  try {
    console.log('收到文件上传请求');
    
    // 检查请求方法
    if (context.request.method !== 'POST') {
      return new Response(JSON.stringify({ error: '只支持 POST 请求' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 检查请求是否包含文件
    const contentType = context.request.headers.get('content-type');
    if (!contentType || !contentType.includes('multipart/form-data')) {
      return new Response(JSON.stringify({ error: '请求必须包含文件' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 解析表单数据
    const formData = await context.request.formData();
    const file = formData.get('csvFile');
    
    if (!file) {
      return new Response(JSON.stringify({ error: '请选择文件' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    console.log('文件信息:', {
      name: file.name,
      size: file.size,
      type: file.type
    });
    
    // 读取文件内容
    const fileContent = await file.text();
    console.log('文件内容长度:', fileContent.length);
    
    // 解析 CSV 内容
    const transactions = [];
    const expenseCategories = {};
    let totalTransactions = 0;
    let totalAmount = 0;
    let totalIncome = 0;
    
    // 简单的 CSV 解析
    const lines = fileContent.split('\n');
    const headers = lines[0].split(',');
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const values = line.split(',');
      const row = {};
      
      headers.forEach((header, index) => {
        row[header.trim()] = values[index]?.trim() || '';
      });
      
      // 解析交易数据
      let transaction;
      
      // 检查是否是微信账单格式
      if (row['交易时间'] || row['时间']) {
        // 微信账单格式
        const timeField = row['交易时间'] || row['时间'] || '';
        const amountField = row['金额(元)'] || row['金额'] || row['交易金额'] || 0;
        const incomeExpenseField = row['收/支'] || row['收支'] || row['类型'] || '支出';
        const descriptionField = row['商品'] || row['交易对方'] || row['对方'] || row['交易描述'] || row['描述'] || '未描述';
        const categoryField = row['交易类型'] || row['类型'] || row['分类'] || '未分类';
        
        // 处理金额，根据收支类型调整符号
        const cleanedAmountField = String(amountField).replace(/[¥￥,\s]/g, '');
        let amount = parseFloat(cleanedAmountField) || 0;
        if (incomeExpenseField.includes('支出') || incomeExpenseField.includes('消费')) {
          amount = -Math.abs(amount);
        } else if (incomeExpenseField.includes('收入') || incomeExpenseField.includes('收款')) {
          amount = Math.abs(amount);
        }
        
        transaction = {
          time: timeField,
          amount: amount,
          description: descriptionField,
          originalCategory: categoryField,
          aiCategory: '其他' // 暂时使用默认分类
        };
      } else if (row['交易时间'] || row['时间']) {
        // 支付宝账单格式
        const timeField = row['交易时间'] || row['时间'] || '';
        const amountField = row['金额'] || row['交易金额'] || 0;
        const incomeExpenseField = row['收支类型'] || row['类型'] || '支出';
        const descriptionField = row['商品名称'] || row['描述'] || row['交易描述'] || '未描述';
        const categoryField = row['分类'] || row['交易类型'] || '未分类';
        
        // 处理金额，根据收支类型调整符号
        const cleanedAmountField = String(amountField).replace(/[¥￥,\s]/g, '');
        let amount = parseFloat(cleanedAmountField) || 0;
        if (incomeExpenseField.includes('支出') || incomeExpenseField.includes('消费')) {
          amount = -Math.abs(amount);
        } else if (incomeExpenseField.includes('收入') || incomeExpenseField.includes('收款')) {
          amount = Math.abs(amount);
        }
        
        transaction = {
          time: timeField,
          amount: amount,
          description: descriptionField,
          originalCategory: categoryField,
          aiCategory: '其他' // 暂时使用默认分类
        };
      } else {
        // 其他格式
        continue;
      }
      
      if (transaction) {
        transactions.push(transaction);
        totalTransactions++;
        totalAmount += transaction.amount;
        if (transaction.amount > 0) {
          totalIncome += transaction.amount;
        }
        
        // 统计消费分类
        if (transaction.amount < 0) {
          const category = transaction.aiCategory;
          if (!expenseCategories[category]) {
            expenseCategories[category] = 0;
          }
          expenseCategories[category] += Math.abs(transaction.amount);
        }
      }
    }
    
    // 尝试使用 AI 分类
    try {
      const zhipuApiKey = context.env.ZHIPU_API_KEY;
      if (zhipuApiKey) {
        console.log('使用智谱 AI API 进行交易分类');
        
        // 批量分类
        for (const transaction of transactions) {
          const systemPrompt = `你是一个专业的交易分类助手，负责根据交易描述和原始分类对交易进行分类。

分类规则：
1. 分类结果必须是以下类别之一：餐饮、购物、交通、娱乐、生活、医疗、教育、其他
2. 根据交易描述和原始分类，选择最适合的类别
3. 只返回类别名称，不要返回其他任何内容`;
          
          const userMessage = `交易描述：${transaction.description}\n原始分类：${transaction.originalCategory}`;
          
          const requestData = {
            model: 'glm-4',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage }
            ],
            temperature: 0.1,
            max_tokens: 10,
            top_p: 0.9
          };
          
          const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${zhipuApiKey}`,
              'Accept': 'application/json'
            },
            body: JSON.stringify(requestData),
            signal: AbortSignal.timeout(5000)
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data && data.choices && data.choices.length > 0) {
              transaction.aiCategory = data.choices[0].message.content.trim();
              console.log('AI 分类结果:', transaction.aiCategory);
            }
          }
        }
      }
    } catch (error) {
      console.error('AI 分类失败:', error);
    }
    
    // 重新统计消费分类
    Object.keys(expenseCategories).forEach(category => {
      expenseCategories[category] = 0;
    });
    
    for (const transaction of transactions) {
      if (transaction.amount < 0) {
        const category = transaction.aiCategory;
        if (!expenseCategories[category]) {
          expenseCategories[category] = 0;
        }
        expenseCategories[category] += Math.abs(transaction.amount);
      }
    }
    
    // 构建响应数据
    const responseData = {
      totalTransactions,
      totalAmount,
      totalIncome,
      expenseCategories,
      transactions
    };
    
    console.log('处理完成，返回响应');
    
    return new Response(JSON.stringify(responseData), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('文件上传处理失败:', error);
    return new Response(JSON.stringify({ 
      error: '处理失败',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}