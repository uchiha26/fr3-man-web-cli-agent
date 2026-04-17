const fs = require('fs');
const unzipper = require('unzipper');

fs.createReadStream('Fr3 Man - Ai Studio -.zip')
  .pipe(unzipper.Extract({ path: 'extract' }))
  .on('close', () => console.log('unzipped'));
