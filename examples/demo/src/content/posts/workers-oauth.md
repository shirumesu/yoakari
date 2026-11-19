---
title: 在 Cloudflare Workers 上给静态博客接 GitHub 登录
published: 2026-11-05
category: 工具
tags: [Cloudflare, OAuth]
pinned: false
---

静态站点没有服务器，后台登录要靠一个很小的 OAuth Worker。整个流程不到一百行，坑主要在回调地址和作用域。

## 回调地址

回调地址必须和 GitHub App 里填的一字不差。

## 作用域

只要 `repo` 就够了。
