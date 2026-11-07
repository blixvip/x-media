const ARTICLE='article[data-testid="tweet"]';
const QUOTE='[data-testid="quoteTweet"],div[role="link"][tabindex]';
function own(article,selector){return [...article.querySelectorAll(selector)].filter(node=>node.closest(ARTICLE)===article&&!node.closest(QUOTE));}
export function extractVideoReferenceTarget(video){
 if(video?.tagName!=='VIDEO')return null;
 const article=video.closest(ARTICLE);
 if(!article||!own(article,'video').includes(video))return null;
 const target=extractReferenceTarget(video);
 if(!target)return null;
 // Keep all videos in post order. Blob playback URLs cannot identify an MP4;
 // the archive worker resolves the original post and needs its video order.
 const attachments=target.attachments.filter(item=>item.kind==='video');
 return attachments.length?{...target,attachments}:null;
}
function videoSource(video){const url=remote(video.currentSrc||video.src,['video.twimg.com']);return url&&/\.mp4$/i.test(new URL(url).pathname)?url:undefined;}
function remote(value,hosts){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&hosts.includes(url.hostname)?url.toString():undefined;}catch{return undefined;}}
export function extractReferenceTarget(node){
 const article=node?.closest?.(ARTICLE);if(!article)return null;
 const time=own(article,'time').find(el=>el.closest('a[href*="/status/"]'));
 const href=time?.closest('a')?.getAttribute('href');let match;
 try{const url=new URL(href,'https://x.com');if(!['x.com','twitter.com'].includes(url.hostname))return null;match=url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})\/?$/);}catch{return null;}
 if(!match)return null;
 const textNode=own(article,'[data-testid="tweetText"]')[0];const fullText=textNode?.textContent??'';
 const names=own(article,'[data-testid="User-Name"] span').map(el=>el.textContent?.trim()).filter(Boolean);
 const author_name=names.find(value=>!value.startsWith('@')&&!/^[·•]$/.test(value))??match[1];
 const avatar=own(article,'[data-testid^="UserAvatar"] img')[0];
 const attachments=[];
 for(const media of own(article,'[data-testid="tweetPhoto"] img,video')){
  if(media.tagName==='IMG'&&media.closest('[data-testid="videoPlayer"]'))continue;
  if(media.tagName==='VIDEO')attachments.push({kind:'video',source_url:videoSource(media),preview_url:remote(media.poster,['pbs.twimg.com']),position:attachments.length});
  else {const source_url=remote(media.currentSrc||media.src,['pbs.twimg.com']);if(source_url&&new URL(source_url).pathname.startsWith('/media/'))attachments.push({kind:'image',source_url,position:attachments.length});}
 }
 return {source_url:`https://x.com/${match[1]}/status/${match[2]}`,source_text:fullText.slice(0,32000),author_name,author_handle:match[1],author_avatar_url:remote(avatar?.src,['pbs.twimg.com']),published_at:time?.getAttribute('datetime')??undefined,complete:fullText.length<=32000&&own(article,'[data-testid="tweet-text-show-more-link"]').length===0,attachments:attachments.slice(0,8)};
}
