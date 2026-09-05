# 改天见

> 改天？哪一天？就这天！

一个把“找个大家都有空的时间”变得特别省事的多人约时间工具。发起人创建房间、设好 DDL，朋友用房间码或链接进来勾选自己的空闲时间，系统自动找出全员重合时段并生成备选方案。

## 界面预览

| 首页 | 创建房间并选择空闲 | 成员与协调 |
| --- | --- | --- |
| ![首页](docs/screenshots/01-home.png) | ![创建房间](docs/screenshots/02-create.png) | ![成员与协调](docs/screenshots/03-room-coordination.png) |

## 核心特点

- **30 分钟粒度日历**：按天查看，点击即选；支持上午 / 下午 / 晚上 / 整天 / 工作日 / 周末快捷选择，可再次点击取消。
- **DDL 截止机制**：发起人确定主题、人数与截止日期时间，成员只能在 DDL 前填写。
- **自动重合计算**：全员填写后自动列出所有可约时段，一键确定并生成可复制的备忘文案。
- **成员身份体系**：每个成员拥有颜色、编号与成员访问码，换设备也能恢复自己的身份；避免同昵称误操作。
- **协调备选**：没有全员重合时，按“最多人可到”优先展示备选，并请缺席成员确认是否可以调整。
- **24 种成员色**：浅蓝、蓝色、深蓝……浅/中/深三档色系，一眼分清谁是谁。
- **零依赖轻量部署**：仅用 Python 标准库实现服务端，可本地运行，也可一键部署到 Railway。

## 快速开始

```bash
python server.py
```

打开 `http://127.0.0.1:8765` 即可使用。房间数据保存在 `data/rooms.json`。

如需换端口或指定数据目录：

```bash
PORT=9000 python server.py
DATA_DIR=/var/data python server.py
```

## 云端部署

项目支持 Railway / Render 等平台：

- 启动命令：`python3 server.py`
- 平台端口：通过 `PORT` 环境变量注入
- 数据持久化：设置 `DATA_DIR` 指向持久卷
- 固定分享域名：设置 `PUBLIC_BASE_URL=https://你的域名`

## 技术栈

- 前端：原生 HTML / CSS / JavaScript，无框架依赖
- 后端：Python `http.server` + `ThreadingHTTPServer`
- 数据：JSON 文件存储

## License

MIT
