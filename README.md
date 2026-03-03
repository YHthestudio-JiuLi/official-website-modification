项目结构

YH_Web/
├── server.js          # 服务器主文件
├── package.json       # 项目配置
├── views/             # EJS 模板文件
│   ├── layout.ejs     # 布局模板
│   ├── index.ejs      # 首页
│   ├── login.ejs      # 登录页
│   ├── register.ejs   # 注册页
│   ├── products.ejs   # 产品页
│   ├── forum.ejs      # 论坛页
│   ├── forum-post.ejs # 发帖页
│   └── contact.ejs    # 联系我们页
└── public/            # 静态资源
    ├── css/
    │   └── style.css  # 样式文件
    └── js/
        └── main.js    # JavaScript 文件

访问网站
打开浏览器访问：http://localhost:3000

访问管理后台

1. 启动服务器后，访问：http://localhost:3000/admin/login

2. 默认管理员账号：
   - 用户名: `admin`
   - 密码: `admin123`

管理功能

- 仪表板: 查看系统统计数据（用户数、产品数、帖子数、消息数）
- 用户管理: 查看所有注册用户，删除用户账号（管理员账号不可删除）
- 产品管理: 添加、编辑、删除产品信息
- 论坛管理: 添加、编辑、删除论坛帖子
- 消息管理: 查看联系消息，标记已读，删除消息

注意事项

- 当前使用内存存储用户和帖子数据，重启服务器后数据会丢失
- 生产环境建议使用真实数据库（如 MongoDB、MySQL）
- 建议配置 HTTPS 以保护用户密码
- 可以添加邮件服务来发送联系表单消息
- **重要**: 首次启动时会自动创建默认管理员账号（admin/admin123），请及时修改密码