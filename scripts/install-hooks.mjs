#!/usr/bin/env node
/** 安装 git pre-commit 钩子（执行提交前守卫） */
import { writeFileSync, chmodSync, existsSync, mkdirSync } from 'node:fs'

const hook = '#!/bin/sh\nnode scripts/guard-staged.mjs || exit 1\n'
mkdirSync('.git/hooks', { recursive: true })
writeFileSync('.git/hooks/pre-commit', hook)
chmodSync('.git/hooks/pre-commit', 0o755)
console.log('.git/hooks/pre-commit 已安装')
