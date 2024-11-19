echo "\n\n\n  Starting update... \n\n\n\"
cd ~
cd wd/waifu
echo "Checking wd/waifu repository... #231"
git_output=$(git pull)
echo "wd/waifu pull result: $git_output #232"
cd ~
cd wd/waifu
if [[ $git_output != *"Already up to date."* ]]; then
  echo "💙💙💙💙💙💙 Changes detected in wd/waifu - Restarting server... #233"
  pm2 restart server
  echo "✅✅✅ Server restart completed #234"
else
  echo "🔴🔴🔴 No changes in wd/waifu #235"
fi
cd ~
cd ~/baileys/Baileys
echo "Checking baileys/Baileys repository... #236"
git_output=$(git pull)
echo "baileys/Baileys pull result: $git_output #237"

if [[ $git_output != *"Already up to date."* ]]; then
  echo "💚💚💚 Changes detected in baileys/Baileys - Restarting baileys... #238"
  pm2 restart baile
  echo "✅✅✅ BAILEYS RESTARTED #239"
else
  echo "🔴🔴🔴 No changes in baileys/Baileys #240"
fi

pm2 logs
