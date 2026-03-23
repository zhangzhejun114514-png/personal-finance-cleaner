export async function onRequest(context) {
  try {
    // 获取请求体
    const { financialGoal, financialQuestion } = await context.request.json();
    
    // 验证请求参数
    if (!financialGoal) {
      return new Response(JSON.stringify({ error: '请选择理财目标' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
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
    const zhipuApiKey = context.env.ZHIPU_API_KEY;
    let advice;
    let apiCallSuccess = false;
    
    if (zhipuApiKey) {
      console.log('智谱 AI API Key 已配置，尝试调用 API');
      let retryCount = 0;
      const maxRetries = 3; // 增加重试次数
      
      while (!apiCallSuccess && retryCount < maxRetries) {
        try {
          retryCount++;
          console.log(`第 ${retryCount} 次尝试调用智谱 AI API，理财目标: ${financialGoal}，具体问题: ${financialQuestion}`);
          
          // 构建完整的请求参数
          const requestData = {
            model: 'glm-4',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage }
            ],
            temperature: 0.7,
            max_tokens: 1000, // 增加最大 tokens
            top_p: 0.9
          };
          
          console.log('发送请求到智谱 AI API:', JSON.stringify(requestData, null, 2));
          
          const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${zhipuApiKey}`,
              'Accept': 'application/json'
            },
            body: JSON.stringify(requestData),
            signal: AbortSignal.timeout(60000) // 增加超时时间到 60 秒
          });
          
          if (!response.ok) {
            throw new Error(`API 调用失败: ${response.status} ${response.statusText}`);
          }
          
          const data = await response.json();
          console.log('智谱 AI API 响应:', JSON.stringify(data, null, 2));
          
          // 提取理财建议
          if (data && data.choices && data.choices.length > 0) {
            advice = data.choices[0].message.content;
            console.log('API 调用成功，获取到理财建议');
            apiCallSuccess = true;
          } else {
            throw new Error('智谱 AI API 返回的响应格式不正确');
          }
        } catch (apiError) {
          console.error(`第 ${retryCount} 次 API 调用失败:`, apiError);
          if (retryCount >= maxRetries) {
            // 如果达到最大重试次数，使用模拟数据作为备选
            console.error('达到最大重试次数，API 调用失败，使用模拟数据作为备选');
          } else {
            // 等待一段时间后重试，每次重试等待时间递增
            const waitTime = 2000 * retryCount;
            console.log(`等待 ${waitTime} 毫秒后重试...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }
    } else {
      // 如果 API Key 未配置，使用模拟数据
      console.error('智谱 AI API Key 未配置，使用模拟数据');
    }
    
    // 如果 API 调用失败，使用模拟数据作为备选
    if (!apiCallSuccess) {
      advice = getMockAdvice(financialGoal, financialQuestion);
      console.log('使用模拟数据作为理财建议');
    }
    
    // 打印最终返回的建议
    console.log('最终返回的理财建议:', advice.substring(0, 100) + '...');
    
    // 返回结果
    return new Response(JSON.stringify({ advice }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('获取理财建议失败:', error);
    return new Response(JSON.stringify({ 
      error: '获取理财建议失败',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

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