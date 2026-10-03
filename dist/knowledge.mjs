export const resources = [
['Hugging Face','https://huggingface.co/','Models and datasets'],['Perplexity','https://www.perplexity.ai/','Research assistant'],['Microsoft Designer','https://designer.microsoft.com/','Images and designs'],['Poe','https://poe.com/','Custom bots'],['Devin','https://devin.ai/desktop','Software development'],['DeepSeek','https://chat.deepseek.com/','AI chat'],['Firebase','https://firebase.google.com/','Database and accounts'],['Netlify','https://www.netlify.com/','Website hosting'],['Claude Platform','https://platform.claude.com/','Paid AI API'],['Can I Use','https://caniuse.com/','Browser compatibility'],['The Odin Project','https://www.theodinproject.com/','Web development curriculum'],['CS50','https://cs50.harvard.edu/x/','Computer science course'],['LeetCode','https://leetcode.com/','Programming practice'],['Exercism','https://exercism.org/','Programming exercises'],['Replit','https://replit.com/','Build applications'],['RapidAPI','https://rapidapi.com/','API marketplace'],['JSONPlaceholder','https://jsonplaceholder.typicode.com/','Sample data for testing'],['CircleCI','https://circleci.com/','Automated software checks'],['Railway','https://railway.com/','Application hosting'],['Neon','https://neon.com/','PostgreSQL database'],['Expo Snack','https://snack.expo.dev/','Mobile app prototypes'],['Unsplash','https://unsplash.com/','Photography'],['Linear','https://linear.app/','Project tasks'],['Trello','https://trello.com/','Task boards'],['Sentry','https://sentry.io/welcome/','Error monitoring'],['LogRocket','https://logrocket.com/','Application troubleshooting'],['Snyk','https://snyk.io/','Code security checks']];
resources.push(['All of My Work','https://allofmywork.com/','User-added resource · contents not imported'],['Complete Web App Guide','https://gim1203-hue.github.io/complete-web-app-guide/','User-added guide · contents not imported']);
export const initialNotes = [
{id:'starter-firebase',title:'Firebase free plan — reference summary',url:'https://firebase.google.com/pricing',text:'Firebase provides databases, authentication and hosting. The Spark plan has no-cost usage quotas and does not require a payment method. Firestore stores documents. Realtime Database stores synchronized JSON data. These databases store your application data; they do not automatically contain general knowledge or power a language model. Some Firebase features require the paid Blaze plan. This summary was checked on October 3, 2026; check the pricing page for current limits.'},
{id:'starter-learning',title:'Free programming learning resources',url:'https://cs50.harvard.edu/x/',text:'CS50 offers a free introduction to computer science through its OpenCourseWare. The Odin Project provides a free web development curriculum. Exercism offers programming exercises. Can I Use provides browser compatibility information. Links to these resources are bookmarks; their full content has not been imported into Atlas.'},
{id:'starter-data',title:'Sample data is not a real database',url:'https://jsonplaceholder.typicode.com/',text:'JSONPlaceholder is a free REST API providing sample posts, comments, albums, photos, todos and users for testing. Its create, update and delete responses are simulated. It does not permanently save your personal application data.'},
{id:'starter-atlas',title:'How Atlas works',url:'https://webllm.mlc.ai/docs/',text:'Atlas runs a downloadable open model using WebLLM in a WebGPU-compatible browser. No paid AI API key is needed. The first load requires internet access to download model files. Questions are processed on the device. General answers come from the model and may be wrong or outdated. Reference answers use passages retrieved from the text added to the library. Atlas does not have live web search or access to private service databases. Notes and conversations are saved in this browser. Attached project files remain in the tab until downloaded. Export a library or conversation backup to keep a separate copy.'}];
const stopWords = new Set('the a an and or of to in is it for my what how do does from about are can with on please write show explain give code function return test'.split(' '));
const words = text => text.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) || [];
export function retrieve(query,notes) {
  if (typeof query !== 'string') return [];
  const terms = [...new Set(words(query))].filter(term => !stopWords.has(term));
  return notes.flatMap(note => {
    const title = new Set(words(note.title));
    return (note.text.match(/[\s\S]{1,900}/g) || []).map((text,chunk) => {
      const tokens = new Set(words(text));
      return {id:note.id,title:note.title,url:note.url,text,chunk,score:terms.reduce((score,term) => score+(tokens.has(term) ? 1 : 0)+(title.has(term) ? 2 : 0),0)};
    });
  }).filter(note => note.score > 0).sort((a,b) => b.score-a.score).slice(0,3);
}
export function validateNotes(value) {
  if (!Array.isArray(value) || value.length > 200) throw Error('Import a library containing at most 200 references.');
  return value.map(note => {
    if (!note || typeof note.title !== 'string' || typeof note.text !== 'string' || !note.title.trim() || !note.text.trim() || note.title.length > 100 || note.text.length > 30000) throw Error('Each reference needs a title and text within the size limits.');
    const url = note.url ?? '';
    if (typeof url !== 'string' || url.length > 2000) throw Error('Invalid source link.');
    if (url) {let parsed; try {parsed = new URL(url);} catch {throw Error('Enter a valid http or https source link.');} if (!['http:','https:'].includes(parsed.protocol)) throw Error('Source links must use http or https.');}
    return {id:crypto.randomUUID(),title:note.title.trim(),text:note.text.trim(),url};
  });
}
