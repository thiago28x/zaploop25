echo "\n\n\n  Starting update... \n\n\n\"
cd ~
cd wd/waifu
echo "Checking wd/waifu repository... #231"
waifu_output=$(git pull)
echo "wd/waifu pull result: $waifu_output #232"

waifu_updated=false
if [[ $waifu_output != *"Already up to date."* ]]; then
  echo "💙💙💙💙💙💙 Changes detected in wd/waifu - Restarting server... #233"
  pm2 restart server
  echo "✅✅✅ Server restart completed #234"
  waifu_updated=true
else
  echo "🔴🔴🔴 No changes in wd/waifu #235"
fi

cd ~
cd ~/baileys/Baileys
echo "Checking baileys/Baileys repository... #236"
baileys_output=$(git pull)
echo "baileys/Baileys pull result: $baileys_output #237"

baileys_updated=false
if [[ $baileys_output != *"Already up to date."* ]]; then
  echo "💚💚💚 Changes detected in baileys/Baileys - Restarting baileys... #238"
  pm2 restart baile
  echo "✅✅✅ BAILEYS RESTARTED #239"
  baileys_updated=true
else
  echo "🔴🔴🔴 No changes in baileys/Baileys #240"
fi

# Output JSON-formatted result
echo "UPDATE_RESULT:{\"waifu\": {\"updated\": $waifu_updated, \"message\": \"$waifu_output\"}, \"baileys\": {\"updated\": $baileys_updated, \"message\": \"$baileys_output\"}}"

pm2 logs
