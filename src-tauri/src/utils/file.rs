use std::fs;
use std::io::{self, BufRead, BufReader};
use std::path::Path;

/// 读取文件内容
pub fn read_file(path: &str) -> io::Result<String> {
    fs::read_to_string(path)
}

/// 写入文件内容
pub fn write_file(path: &str, content: &str) -> io::Result<()> {
    // 确保父目录存在
    if let Some(parent) = Path::new(path).parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, content)
}

/// 追加文件内容
pub fn append_file(path: &str, content: &str) -> io::Result<()> {
    use std::fs::OpenOptions;
    use std::io::Write;

    let mut file = OpenOptions::new().create(true).append(true).open(path)?;

    writeln!(file, "{}", content)
}

/// 检查文件是否存在
pub fn file_exists(path: &str) -> bool {
    Path::new(path).exists()
}

/// 读取文件最后 N 行
pub fn read_last_lines(path: &str, n: usize) -> io::Result<Vec<String>> {
    let file = fs::File::open(path)?;
    let reader = BufReader::new(file);
    let lines: Vec<String> = reader.lines().filter_map(|l| l.ok()).collect();

    let start = if lines.len() > n { lines.len() - n } else { 0 };
    Ok(lines[start..].to_vec())
}

/// 从环境变量文件读取值
pub fn read_env_value(env_file: &str, key: &str) -> Option<String> {
    let content = read_file(env_file).ok()?;

    for line in content.lines() {
        let line = line.trim();
        if line.starts_with(&format!("export {}=", key)) {
            let raw_value = line.trim_start_matches(&format!("export {}=", key)).trim();
            let value = if raw_value.len() >= 2
                && ((raw_value.starts_with('"') && raw_value.ends_with('"'))
                    || (raw_value.starts_with('\'') && raw_value.ends_with('\'')))
            {
                &raw_value[1..raw_value.len() - 1]
            } else {
                raw_value
            };

            let mut unescaped = String::new();
            let mut chars = value.chars().peekable();
            while let Some(ch) = chars.next() {
                if ch == '\\' {
                    if let Some(next) = chars.next() {
                        match next {
                            '\\' => unescaped.push('\\'),
                            '"' => unescaped.push('"'),
                            '\'' => unescaped.push('\''),
                            'n' => unescaped.push('\n'),
                            't' => unescaped.push('\t'),
                            other => {
                                unescaped.push('\\');
                                unescaped.push(other);
                            }
                        }
                    } else {
                        unescaped.push('\\');
                    }
                } else {
                    unescaped.push(ch);
                }
            }

            return Some(unescaped);
        }
    }

    None
}

/// 设置环境变量文件中的值
pub fn set_env_value(env_file: &str, key: &str, value: &str) -> io::Result<()> {
    let content = read_file(env_file).unwrap_or_default();
    let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();

    let new_line = format!("export {}=\"{}\"", key, value);
    let mut found = false;

    for line in &mut lines {
        if line.starts_with(&format!("export {}=", key)) {
            *line = new_line.clone();
            found = true;
            break;
        }
    }

    if !found {
        lines.push(new_line);
    }

    write_file(env_file, &lines.join("\n"))
}

/// 从环境变量文件中删除指定的值
pub fn remove_env_value(env_file: &str, key: &str) -> io::Result<()> {
    let content = read_file(env_file).unwrap_or_default();
    let lines: Vec<String> = content
        .lines()
        .filter(|line| !line.starts_with(&format!("export {}=", key)))
        .map(|s| s.to_string())
        .collect();

    write_file(env_file, &lines.join("\n"))
}
