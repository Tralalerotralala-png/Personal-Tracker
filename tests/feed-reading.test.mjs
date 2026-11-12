import test from 'node:test';
import assert from 'node:assert/strict';
import {articleKey,readingIndex,updateReading,savedHeadlines} from '../js/feed/reading.js';
import {createStore} from '../js/data/store.js';
import {createMemoryAdapter} from '../js/data/adapters.js';
test('article reading status and bookmarks persist without downloading article bodies',async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 const article={title:'Rain news',link:'https://example.org/one',source_name:'Example'};
 await updateReading(store,article,{read:true,saved:true});
 const current=await readingIndex(store);
 assert.equal(current[articleKey(article)].read,true);
 assert.equal(savedHeadlines(current)[0].link,article.link);
 await updateReading(store,article,{read:false});
 assert.equal((await readingIndex(store))[article.link].saved,true);
});
