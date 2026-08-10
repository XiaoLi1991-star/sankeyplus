# Contributing to SankeyPlus

感谢你为 SankeyPlus 提交改进。请让功能保持跨领域通用，避免把数据语义绑定到特定科研方向。

## 开发环境

- Node.js `^20.19.0` 或 `>=22.12.0`
- npm 10

```bash
npm ci
npm run dev
```

## 提交修改

1. 从 `main` 创建独立分支。
2. 保持数据、标签、颜色、布局和输出职责清晰。
3. 为计算逻辑和文档格式变化补充或更新测试。
4. 不要提交真实研究数据、凭据、本地路径、`node_modules/`、`dist/` 或临时导出文件。
5. 提交前运行：

```bash
npm test
npm run build
```

提交 Pull Request 时，请说明用户可见变化、验证方式以及仍未覆盖的边界情况。

参与贡献即表示你同意按本项目的 MIT License 提供所提交的内容。
