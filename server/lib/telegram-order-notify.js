const crypto = require('crypto');

function createOrderTelegramTools({ telegramRequestWithToken }) {
  function getOrderBotToken() {
    const raw = process.env.ORDER_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    if (!raw) return '';
    return String(raw).replace(/^\uFEFF/, '').replace(/\uFEFF/g, '').replace(/[\u200B-\u200D\u00AD]/g, '').replace(/\r/g, '').trim();
  }

  function getOrderChatId() {
    const raw = process.env.ORDER_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
    if (!raw) return '';
    return String(raw).replace(/^\uFEFF/, '').replace(/\r/g, '').trim();
  }

  function parseRecipientInfo(shippingAddress) {
    const raw = String(shippingAddress || '').trim();
    const out = { name: '', phone: '', address: raw };
    if (!raw) return out;

    const parts = raw
      .split(/\||；|;|\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    const normalizeKey = (key) => String(key || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');

    const isNameKey = (key) => ['name', 'receiver', 'recipient', '收件人', '收货人', '姓名', '联系人'].includes(key);
    const isPhoneKey = (key) => ['phone', 'mobile', 'tel', '电话', '手机号', '联系电话', '电话号码', '收件人电话'].includes(key);
    const isAddressKey = (key) => ['address', 'addr', '地址', '收货地址', '收件地址', '详细地址'].includes(key);

    let parsed = false;
    for (const p of parts) {
      const idx = p.search(/[:：]/);
      if (idx <= 0) continue;
      const key = normalizeKey(p.slice(0, idx));
      const val = p.slice(idx + 1).trim();
      if (!val) continue;
      if (isNameKey(key)) {
        out.name = val;
        parsed = true;
      } else if (isPhoneKey(key)) {
        out.phone = val;
        parsed = true;
      } else if (isAddressKey(key)) {
        out.address = val;
        parsed = true;
      }
    }

    if (!parsed) {
      out.address = raw;
    }

    if (!out.phone) {
      const phoneMatch = raw.match(/(1[3-9]\d{9})/);
      if (phoneMatch) out.phone = phoneMatch[1];
    }

    return out;
  }

  function getExplorerLink(network, txHash) {
    const h = encodeURIComponent(String(txHash || '').trim());
    if (!h) return '';
    const n = String(network || '').toUpperCase();
    let chainPath = 'tron';
    if (n.includes('ERC20') || n.includes('ETH')) chainPath = 'eth';
    if (n.includes('BEP20') || n.includes('BSC')) chainPath = 'bsc';
    return `https://www.oklink.com/${chainPath}/tx/${h}`;
  }

  function toOklinkChainShortName(network) {
    const n = String(network || '').toUpperCase();
    if (n.includes('TRC20') || n.includes('TRON')) return 'tron';
    if (n.includes('ERC20') || n.includes('ETH')) return 'eth';
    if (n.includes('BEP20') || n.includes('BSC')) return 'bsc';
    return 'tron';
  }

  function decodeTrc20AmountFromInputData(inputData) {
    const raw = String(inputData || '').trim().toLowerCase();
    if (!raw) return null;
    const cleaned = raw.replace(/^0x/, '');
    if (!cleaned.startsWith('a9059cbb')) return null;
    if (cleaned.length < 8 + 64 + 64) return null;
    const amountHex = cleaned.slice(8 + 64, 8 + 64 + 64);
    try {
      const amountInt = BigInt('0x' + amountHex);
      const base = 1000000n;
      const integer = amountInt / base;
      const fraction = amountInt % base;
      if (fraction === 0n) return `${integer.toString()} USDT`;
      const frac = fraction.toString().padStart(6, '0').replace(/0+$/, '');
      return `${integer.toString()}.${frac} USDT`;
    } catch {
      return null;
    }
  }

  function formatUsdtFromRawValue(raw) {
    try {
      const n = BigInt(String(raw || '0'));
      const base = 1000000n;
      const integer = n / base;
      const fraction = n % base;
      if (fraction === 0n) return `${integer.toString()} USDT`;
      const frac = fraction.toString().padStart(6, '0').replace(/0+$/, '');
      return `${integer.toString()}.${frac} USDT`;
    } catch {
      return 'N/A';
    }
  }

  function tronHexToBase58(input) {
    const raw = String(input || '').trim().toLowerCase().replace(/^0x/, '');
    if (!raw) return 'N/A';
    let hex = raw;
    if (hex.startsWith('41') && hex.length === 42) {
      // ok
    } else if (hex.length === 40) {
      hex = '41' + hex;
    } else if (hex.length > 42) {
      hex = hex.slice(-40);
      hex = '41' + hex;
    } else {
      return input;
    }
    const payload = Buffer.from(hex, 'hex');
    const hash1 = crypto.createHash('sha256').update(payload).digest();
    const hash2 = crypto.createHash('sha256').update(hash1).digest();
    const full = Buffer.concat([payload, hash2.subarray(0, 4)]);
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let x = BigInt('0x' + full.toString('hex'));
    let out = '';
    while (x > 0n) {
      const mod = Number(x % 58n);
      out = alphabet[mod] + out;
      x = x / 58n;
    }
    for (let i = 0; i < full.length && full[i] === 0; i += 1) {
      out = '1' + out;
    }
    return out || 'N/A';
  }

  async function queryTronUsdtTransferByTxHash(txHash) {
    const hash = String(txHash || '').trim();
    if (!hash) return null;
    try {
      const [eventsRes, txInfoRes, txRes] = await Promise.all([
        fetch(`https://api.trongrid.io/v1/transactions/${hash}/events`),
        fetch('https://api.trongrid.io/wallet/gettransactioninfobyid', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ value: hash }),
        }),
        fetch('https://api.trongrid.io/wallet/gettransactionbyid', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ value: hash }),
        }),
      ]);
      const eventsJson = await eventsRes.json();
      const txInfoJson = await txInfoRes.json();
      const txJson = await txRes.json();
      const events = Array.isArray(eventsJson?.data) ? eventsJson.data : [];
      const transfer = events.find((e) =>
        String(e?.event_name || '').toLowerCase() === 'transfer' &&
        String(e?.contract_address || '').toUpperCase() === 'TR7NHQJEKQXGTCI8Q8ZY4PL8OTSZGJLJ6T'
      ) || events.find((e) => String(e?.event_name || '').toLowerCase() === 'transfer');
      const contractValue = txJson?.raw_data?.contract?.[0]?.parameter?.value || {};
      const ownerAddressHex = String(contractValue?.owner_address || '').trim();
      const dataHex = String(contractValue?.data || '').trim().toLowerCase();
      let toAddressHex = '';
      let amountRaw = '';
      if (dataHex.length >= (8 + 64 * 3)) {
        const arg2 = dataHex.slice(8 + 64, 8 + 128);
        const arg3 = dataHex.slice(8 + 128, 8 + 192);
        toAddressHex = arg2.slice(-40);
        amountRaw = String(BigInt('0x' + arg3));
      }
      const fromAddress = ownerAddressHex ? tronHexToBase58(ownerAddressHex) : tronHexToBase58(String(transfer?.result?.from || transfer?.result?.['0'] || ''));
      const toAddress = toAddressHex ? tronHexToBase58(toAddressHex) : tronHexToBase58(String(transfer?.result?.to || transfer?.result?.['1'] || ''));
      const rawValue = amountRaw || String(transfer?.result?.value || transfer?.result?.['2'] || '0');
      const paidAmount = formatUsdtFromRawValue(rawValue);
      const status = String(txInfoJson?.receipt?.result || txInfoJson?.result || 'UNKNOWN');
      return { status, fromAddress, toAddress, paidAmount };
    } catch (e) {
      console.error('[Order Telegram] query tron event error:', e.message);
      return null;
    }
  }

  async function queryTxStatusFromOklinkPage(network, txHash) {
    const link = getExplorerLink(network, txHash);
    if (!link) {
      return { status: 'UNKNOWN', fromAddress: 'N/A', toAddress: 'N/A', paidAmount: 'N/A', missingApiKey: true };
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const r = await fetch(link, { method: 'GET', signal: controller.signal });
      clearTimeout(timer);
      const html = await r.text();
      const text = String(html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, '\n')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+\n/g, '\n')
        .replace(/\n{2,}/g, '\n');

      const statusMatch = text.match(/Status:\s*([^\n]+)/i) || text.match(/Result:\s*([^\n]+)/i);
      const fromMatch = text.match(/From:\s*([A-Za-z0-9]{20,})/i);
      const toMatch = text.match(/To:\s*([A-Za-z0-9]{20,})/i) || text.match(/Contract address:\s*([A-Za-z0-9]{20,})/i);
      const amountMatch = text.match(/Transfer amount:\s*([^\n]+)/i);
      const inputDataMatch = text.match(/Input data:\s*([a-fA-F0-9]+)/i);
      const decodedTokenAmount = decodeTrc20AmountFromInputData(inputDataMatch ? inputDataMatch[1] : '');
      const normalizedAmount = amountMatch ? amountMatch[1].trim() : 'N/A';
      const isZeroNativeAmount = /^0(\.0+)?(?:\s*[A-Za-z]+)?$/i.test(normalizedAmount);
      const paidAmount = (decodedTokenAmount && (normalizedAmount === 'N/A' || isZeroNativeAmount))
        ? decodedTokenAmount
        : normalizedAmount;

      return {
        status: statusMatch ? statusMatch[1].trim() : 'UNKNOWN',
        fromAddress: fromMatch ? fromMatch[1].trim() : 'N/A',
        toAddress: toMatch ? toMatch[1].trim() : 'N/A',
        paidAmount,
        missingApiKey: true,
      };
    } catch (e) {
      console.error('[Order Telegram] scrape tx error:', e.message);
      return { status: 'UNKNOWN', fromAddress: 'N/A', toAddress: 'N/A', paidAmount: 'N/A', missingApiKey: true };
    }
  }

  async function queryTxStatus(network, txHash) {
    const hash = String(txHash || '').trim();
    if (!hash) return { status: 'N/A', fromAddress: 'N/A', toAddress: 'N/A', paidAmount: 'N/A' };
    const n = String(network || '').toUpperCase();
    if (n.includes('TRC20') || n.includes('TRON')) {
      const tron = await queryTronUsdtTransferByTxHash(hash);
      if (tron) {
        return { ...tron, missingApiKey: false };
      }
    }
    const chainShortName = toOklinkChainShortName(network);
    const apiKey = String(process.env.OKLINK_API_KEY || '').trim();
    if (!apiKey) {
      return queryTxStatusFromOklinkPage(network, hash);
    }
    try {
      const u = new URL('https://www.oklink.com/api/v5/explorer/transaction/transaction-fills');
      u.searchParams.set('chainShortName', chainShortName);
      u.searchParams.set('txid', hash);
      const r = await fetch(u.toString(), {
        method: 'GET',
        headers: {
          'Ok-Access-Key': apiKey,
        },
      });
      const j = await r.json();
      const item = Array.isArray(j?.data) && j.data.length > 0 ? (j.data[0] || {}) : {};
      const status = String(
        item?.txStatus ||
        item?.state ||
        item?.status ||
        (j?.code === '0' ? 'SUCCESS' : 'UNKNOWN')
      );
      const fromAddress = String(item?.from || item?.sender || item?.fromAddress || 'N/A');
      const toAddress = String(item?.to || item?.receiver || item?.toAddress || 'N/A');
      const paidAmount = String(
        item?.amount ||
        item?.txAmount ||
        item?.transferAmount ||
        item?.tokenAmount ||
        item?.value ||
        'N/A'
      );
      return { status, fromAddress, toAddress, paidAmount, missingApiKey: false };
    } catch (e) {
      console.error('[Order Telegram] query tx error:', e.message);
    }
    return { status: 'UNKNOWN', fromAddress: 'N/A', toAddress: 'N/A', paidAmount: 'N/A', missingApiKey: false };
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatProductCategory(order) {
    const primary = String(order?.categoryName || '').trim();
    const sub = String(order?.subCategoryName || '').trim();
    if (primary && sub) return `${primary} / ${sub}`;
    if (primary) return primary;
    if (sub) return sub;
    return '未分类';
  }

  function formatPaidAmountAsUsdt(rawAmount) {
    const raw = String(rawAmount || '').trim();
    if (!raw || raw.toUpperCase() === 'N/A') return 'N/A USDT';
    if (/\bUSDT\b/i.test(raw)) return raw.replace(/\busdt\b/i, 'USDT');
    const num = raw.match(/[\d.,]+/);
    if (num) return `${num[0]} USDT`;
    return `${raw} USDT`;
  }

  function formatOrderNo(order) {
    const no = order?.orderNo ?? order?.order_no;
    if (no) return String(no);
    return order?.id != null ? String(order.id) : 'N/A';
  }

  async function notifyOrderPaid(order) {
    const chatId = getOrderChatId();
    const token = getOrderBotToken();
    if (!chatId || !token) return;
    const recipient = parseRecipientInfo(order?.shippingAddress);
    const fallbackToAddress = String(order?.usdtWallet || '').trim() || 'N/A';
    const skipChainLookup = !!order?.txVerifyDisabled;
    const tx = skipChainLookup
      ? {
          status: '未启用链上验单',
          fromAddress: 'N/A',
          toAddress: fallbackToAddress,
          paidAmount: order?.totalAmount != null ? `${order.totalAmount} USDT` : 'N/A',
          missingApiKey: true,
        }
      : await queryTxStatus(order?.network, order?.txHash);
    const explorer = getExplorerLink(order?.network, order?.txHash);
    const toAddress = tx.toAddress && tx.toAddress !== 'N/A' ? tx.toAddress : fallbackToAddress;
    const paidAmountRaw = tx.paidAmount && tx.paidAmount !== 'N/A' ? tx.paidAmount : 'N/A';
    const paidAmount = formatPaidAmountAsUsdt(paidAmountRaw);
    const statusLine = tx.missingApiKey
      ? '（来自页面解析）'
      : String(tx.status || 'UNKNOWN');
    const text = `🧾 <b>新订单支付通知</b>

🆔 <b>订单号:</b> <code>${esc(formatOrderNo(order))}</code>
👤 <b>用户:</b> ${esc(order?.username || '')}
📦 <b>商品:</b> ${esc(order?.productName || '')}
🏷 <b>类型:</b> ${esc(formatProductCategory(order))}
🔢 <b>数量:</b> ${esc(order?.quantity)}
💰 <b>订单金额:</b> ${esc(order?.totalAmount)} USDT
💳 <b>支付金额:</b> ${esc(order?.totalAmount)} USDT
🔗 <b>网络:</b> ${esc(order?.network || 'TRC20')}
👥 <b>收件人:</b> ${esc(recipient.name || '')}
📞 <b>电话:</b> ${esc(recipient.phone || '')}
📍 <b>地址:</b> ${esc(recipient.address || '')}

🧾 <b>哈希:</b> <code>${esc(order?.txHash || '')}</code>
⛓ <b>链上状态:</b> ${esc(statusLine)}
🏦 <b>付款地址:</b> <code>${esc(tx.fromAddress)}</code>
💸 <b>付款金额:</b> ${esc(paidAmount)}
🎯 <b>收款地址:</b> <code>${esc(toAddress)}</code>
${explorer ? `🔎 <a href="${explorer}">区块链浏览器查看交易</a>` : ''}`;

    const payload = {
      chat_id: String(chatId),
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[
          {
            text: '🗑 删除订单',
            callback_data: `order_del:${String(order?.id || '')}`,
          },
        ]],
      },
    };
    await telegramRequestWithToken(token, 'sendMessage', payload);
  }

  return {
    notifyOrderPaid,
    getOrderBotToken,
    getOrderChatId,
    formatOrderNo,
  };
}

module.exports = { createOrderTelegramTools };
