#!/bin/zsh
# 双击启动第5课课堂服务（macOS）。端口8796，可与第4课（8794）同时运行。
cd "${0:A:h}"
PORT=${PORT:-8796}
if ! command -v node >/dev/null; then
  print '请先安装 Node.js 22.13 或更新版本，再打开本文件。'
  read 'reply?按回车退出'; exit 1
fi
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)'; then
  print "当前 Node.js 版本为 $(node -v)，本应用需要 22.13 或更新版本（内置SQLite）。"
  read 'reply?按回车退出'; exit 1
fi
if curl --silent --fail http://localhost:$PORT/api/classes >/dev/null; then
  open "http://localhost:$PORT/teacher"
  print '课堂服务已经在运行。关闭原启动窗口可停止服务。'
  read 'reply?按回车退出这个窗口'; exit 0
fi
PORT=$PORT node --no-warnings server.cjs &
lesson_pid=$!
trap 'kill $lesson_pid 2>/dev/null' EXIT INT TERM
for attempt in {1..30}; do
  if curl --silent --fail http://localhost:$PORT/api/classes >/dev/null; then open "http://localhost:$PORT/teacher"; break; fi
  if ! kill -0 $lesson_pid 2>/dev/null; then print '启动失败，请查看上方的提示。'; read 'reply?按回车退出'; exit 1; fi
  sleep 0.2
done
wait $lesson_pid
