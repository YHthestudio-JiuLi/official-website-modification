const PY_DB_URL = process.env.PY_DB_URL || 'http://127.0.0.1:5100';

// When piping output (e.g. `node view-db.js | head`), ignore EPIPE.
process.stdout.on('error', (err) => {
  if (err && err.code === 'EPIPE') process.exit(0);
});

async function rpc(op, args = {}) {
  const res = await fetch(`${PY_DB_URL}/rpc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op, args })
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const detail = payload && (payload.detail || payload.error || payload.message);
    throw new Error(detail || `Python DB backend error (${res.status})`);
  }

  if (!payload || payload.ok !== true) {
    throw new Error((payload && payload.error) || 'Python DB backend returned invalid payload');
  }

  return payload.result;
}

console.log('='.repeat(60));
console.log('YHthestudio 数据库查看工具');
console.log('='.repeat(60));
console.log('Python DB 后端:', PY_DB_URL);
console.log('');

// 查看所有表
async function showTables() {
  const tables = await rpc('meta.listTables');
  console.log('数据库表列表:');
  tables.forEach((name, index) => {
    console.log(`  ${index + 1}. ${name}`);
  });
  console.log('');
  return tables.map(name => ({ name }));
}

// 查看表数据
async function showTableData(tableName) {
  const rows = await rpc('meta.tableData', { table: tableName });

  console.log(`\n${'='.repeat(60)}`);
  console.log(`表: ${tableName} (共 ${rows.length} 条记录)`);
  console.log('='.repeat(60));
  
  if (rows.length === 0) {
    console.log('(无数据)');
    return rows;
  }

  const columns = Object.keys(rows[0]);
  console.log(columns.join(' | '));
  console.log('-'.repeat(60));

  rows.forEach((row) => {
    const values = columns.map(col => {
      let value = row[col];
      if (col === 'password') value = '***';
      if (typeof value === 'string' && value.length > 50) value = value.substring(0, 50) + '...';
      return value || '(null)';
    });
    console.log(values.join(' | '));
  });

  return rows;
}

// 统计信息
async function showStats() {
  const tables = await rpc('meta.listTables');
  if (!tables.length) {
    console.log('⚠️  数据库中没有表，请先启动 Python DB 后端初始化数据库');
    return [];
  }

  const results = [];
  for (const table of tables) {
    try {
      const count = await rpc('meta.tableCount', { table });
      results.push({ table, count });
    } catch (_) {
      results.push({ table, count: 0 });
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('数据统计:');
  console.log('='.repeat(60));
  results.forEach(({ table, count }) => {
    console.log(`  ${String(table).padEnd(20)} : ${count} 条记录`);
  });
  return results;
}

// 主函数
async function main() {
  try {
    await fetch(`${PY_DB_URL}/health`).then(r => {
      if (!r.ok) throw new Error('not ok');
    });

    // 显示统计信息
    await showStats();
    
    // 显示所有表
    await showTables();
    
    // 获取所有表并显示数据
    const tableRows = await showTables();
    const tables = tableRows.map(row => row.name);
    
    for (const table of tables) {
      try {
        await showTableData(table);
      } catch (error) {
        console.log(`\n⚠️  无法查看表 ${table}: ${error.message}`);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('查看完成！');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('错误:', error);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = { showTables, showTableData, showStats };

