// 快速初始化数据库脚本（Python DB 后端会在启动时自动建表+初始化默认数据）
const PY_DB_URL = process.env.PY_DB_URL || 'http://127.0.0.1:5100';

async function main() {
  console.log('正在初始化数据库（通过 Python DB 后端）...');

  try {
    const res = await fetch(`${PY_DB_URL}/health`);
    if (!res.ok) throw new Error(`health check failed: ${res.status}`);

    console.log('\n✅ Python DB 后端已就绪，数据库已初始化！');
    console.log('现在可以运行以下命令查看数据:');
    console.log('  npm run view-db');
    process.exit(0);
  } catch (err) {
    console.log('\n⚠️  无法连接 Python DB 后端。请先启动它:');
    console.log('  npm run py');
    console.log('');
    console.log(`当前 PY_DB_URL=${PY_DB_URL}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}




















