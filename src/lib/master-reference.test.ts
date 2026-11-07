import { describe, expect, it } from 'vitest';
import { masterReference } from './master-reference';
import { openLocalRadarDatabase } from '@/x-master/lib/x-radar-local-db';
import { initializeReferences, saveReference, listReferences } from '@/x-master/lib/x-references';

describe('X Media and X Master integration', () => {
  it('preserves photo/video order and chooses the highest quality safe MP4', () => {
    const result = masterReference({ id:'123456789',username:'ada',text:'A post',createdAt:'2026-09-08T12:00:00Z',media:[
      {mediaKey:'a',type:'photo',url:'https://pbs.twimg.com/media/a.jpg',variants:[]},
      {mediaKey:'b',type:'video',previewImageUrl:'https://pbs.twimg.com/media/b.jpg',variants:[{url:'https://video.twimg.com/low.mp4',bitRate:10},{url:'https://video.twimg.com/high.mp4',bitRate:100}]},
      {mediaKey:'c',type:'video',variants:[{url:'https://untrusted.invalid/clip.mp4',bitRate:1000},{url:'blob:temporary'},{url:'https://video.twimg.com/stream.m3u8'}]},
    ]});
    expect(result.attachments.map(a=>[a.kind,a.position])).toEqual([['image',0],['video',1],['video',2]]);
    expect(result.attachments[1].source_url).toBe('https://video.twimg.com/high.mp4');
    expect(result.attachments[2].source_url).toBeUndefined();
  });
  it('marks truncated public text incomplete',()=>expect(masterReference({id:'123456',username:'ada',text:'Read more…',createdAt:'',media:[]}).complete).toBe(false));
  it('saves converted media to the real SQLite reference library and deduplicates it', async()=>{
    const db=await openLocalRadarDatabase(':memory:');await initializeReferences(db);
    const input=masterReference({id:'123456789',username:'ada',text:'A useful video',createdAt:'2026-09-08T12:00:00Z',media:[{mediaKey:'a',type:'video',variants:[]}]});
    const one=await saveReference(db,'app:test',input);const two=await saveReference(db,'app:test',input);
    expect(two.id).toBe(one.id);const result=await listReferences(db,'app:test',{kind:'video'});
    expect(result.total).toBe(1);expect(result.items[0].attachments[0].state).toBe('queued');
    expect((await listReferences(db,'app:other',{})).total).toBe(0);
  });
  it('returns SELECT results in database batches and rolls back failed writes',async()=>{
    const db=await openLocalRadarDatabase(':memory:');await db.prepare('CREATE TABLE batch_test(id INTEGER PRIMARY KEY)').run();
    const result=await db.batch([db.prepare('INSERT INTO batch_test VALUES(1)'),db.prepare('SELECT id FROM batch_test')]);
    expect(result[1].results).toEqual([{id:1}]);
    await expect(db.batch([db.prepare('INSERT INTO batch_test VALUES(2)'),db.prepare('INSERT INTO batch_test VALUES(1)')])).rejects.toThrow();
    expect((await db.prepare('SELECT id FROM batch_test').all()).results).toEqual([{id:1}]);
  });
});
