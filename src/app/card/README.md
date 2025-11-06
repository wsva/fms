ALTER TABLE qsa_tag DROP COLUMN parent;
ALTER TABLE qsa_tag ADD COLUMN abstract VARCHAR(1);
ALTER TABLE qsa_tag ADD COLUMN children TEXT;

update qsa_tag set abstract = 'N' where abstract is null;

为了在 card test 中减少 tag 选项，尝试设置抽象 tag，
抽象 tag 本身不包含 card，但是 children 为 tag uuid 数组