ALTER TABLE qsa_tag DROP COLUMN parent;
ALTER TABLE qsa_tag ADD COLUMN abstract VARCHAR(1);
ALTER TABLE qsa_tag ADD COLUMN children TEXT;

update qsa_tag set abstract = 'N' where abstract is null;

为了在 card test 中减少 tag 选项，尝试设置抽象 tag，
抽象 tag 本身不包含 card，但是 children 为 tag uuid 数组


# collect
按 tag 清空数据，collect数据（复制别人的某个tag的所有card）

# read
阅读一本书

一个事物的不同角度。从另一个角度组织card。book, chapter 组合起来便是 tag, question 为 sentence，answer 为 note