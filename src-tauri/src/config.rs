pub const PRODUCT_NAME: &str = "Trolley";
pub const DATABASE_FILE: &str = "trolley.sqlite3";
pub const MAX_WORKSPACE_ROWS: usize = 250_000;
pub const MAX_WORKSPACE_BYTES: u64 = 256 * 1024 * 1024;
pub const MAX_RESTORE_BYTES: u64 = 1024 * 1024 * 1024;
pub const MAX_PARENT_DEPTH: usize = 256;
pub const MAX_CONFIGURATION_BYTES: usize = 20 * 1024 * 1024;
pub const MAX_CONFIGURATION_TOKENS: usize = 1_000_000;
pub const MAX_REVISION: u64 = 9_007_199_254_740_991;

use serde_json::Value;

static DEFAULTS: std::sync::LazyLock<Value> = std::sync::LazyLock::new(|| {
    serde_json::from_str(include_str!(
        "../../src/config/workspace-defaults.json"
    ))
    .expect("bundled workspace defaults must contain valid JSON")
});

/// Return the shared project defaults used by both native and frontend code.
pub fn default_settings() -> Value {
    DEFAULTS["projectSettings"].clone()
}

/// Complete legacy omissions while rejecting malformed supplied fields.
fn complete(
    value: &mut Value,
    defaults: &Value,
    name: &str,
) -> Result<(), String> {
    let object = value
        .as_object_mut()
        .ok_or_else(|| format!("{name} must be an object."))?;
    for (key, fallback) in defaults.as_object().expect("object defaults") {
        let field = object
            .entry(key.clone())
            .or_insert_with(|| fallback.clone());
        let field_name = format!("{name}.{key}");
        let valid = match fallback {
            Value::Object(_) => {
                complete(field, fallback, &field_name)?;
                true
            }
            Value::Array(_) => field.is_array(),
            Value::String(_) => field.is_string(),
            Value::Bool(_) => field.is_boolean(),
            Value::Number(_) => field.is_number(),
            Value::Null => field.is_null() || field.is_string(),
        };
        if !valid {
            return Err(format!("{field_name} has an invalid type."));
        }
    }
    Ok(())
}

fn choice(value: &Value, choices: &[&str], name: &str) -> Result<(), String> {
    if value.as_str().is_some_and(|text| choices.contains(&text)) {
        Ok(())
    } else {
        Err(format!("{name} has an unsupported value."))
    }
}

fn unique_numbers(
    value: &Value,
    minimum: u64,
    maximum: u64,
    name: &str,
) -> Result<(), String> {
    let mut seen = std::collections::HashSet::new();
    for number in value
        .as_array()
        .ok_or_else(|| format!("{name} must be an array."))?
    {
        let number = number
            .as_u64()
            .filter(|number| (*number >= minimum) && (*number <= maximum))
            .ok_or_else(|| format!("{name} contains an invalid number."))?;
        if !seen.insert(number) {
            return Err(format!("{name} contains duplicate values."));
        }
    }
    Ok(())
}

fn choices(value: &Value, allowed: &[&str], name: &str) -> Result<(), String> {
    let mut seen = std::collections::HashSet::new();
    for item in value
        .as_array()
        .ok_or_else(|| format!("{name} must be an array."))?
    {
        choice(item, allowed, name)?;
        if !seen.insert(item.as_str().expect("validated string")) {
            return Err(format!("{name} contains duplicate values."));
        }
    }
    Ok(())
}

/// Validate and normalize all project settings at the persistence boundary.
pub fn normalize_settings(value: &mut Value) -> Result<(), String> {
    let defaults = default_settings();
    complete(value, &defaults, "Project settings")?;
    choice(
        &value["defaultView"],
        &["board", "gantt", "matrix", "list"],
        "Default view",
    )?;
    if value["firstDayOfWeek"].as_u64().is_none_or(|day| day > 6) {
        return Err("First day of week must be an integer from 0 to 6.".into());
    }
    unique_numbers(&value["workingDays"], 0, 6, "Working days")?;
    if value["workingDays"]
        .as_array()
        .expect("validated array")
        .is_empty()
    {
        return Err("Choose at least one working day.".into());
    }
    choices(
        &value["cardFields"],
        &[
            "labels",
            "priority",
            "dates",
            "progress",
            "checklist",
            "dependencies",
            "assignee",
            "milestone",
        ],
        "Card fields",
    )?;
    let priorities =
        value["priorities"].as_array_mut().expect("validated array");
    if priorities.len() != 5 {
        return Err("Provide all five priority ranks.".into());
    }
    let mut ranks = std::collections::HashSet::new();
    for (index, priority) in priorities.iter_mut().enumerate() {
        let fallback = defaults["priorities"]
            .as_array()
            .expect("bundled priorities")
            .iter()
            .find(|entry| entry["rank"] == priority["rank"])
            .unwrap_or(&defaults["priorities"][index]);
        complete(priority, fallback, "Priority")?;
        let rank = priority["rank"]
            .as_u64()
            .filter(|rank| (1..=5).contains(rank))
            .ok_or("Priority rank must be an integer from 1 to 5.")?;
        if !ranks.insert(rank) {
            return Err("Priority ranks must be unique.".into());
        }
    }
    if ranks.len() != 5 {
        return Err("Provide all five priority ranks.".into());
    }
    if value["quadrants"]
        .as_array()
        .expect("validated array")
        .len()
        != 4
    {
        return Err("Provide all four quadrants.".into());
    }
    let mut keys = std::collections::HashSet::new();
    for (index, quadrant) in value["quadrants"]
        .as_array_mut()
        .expect("validated array")
        .iter_mut()
        .enumerate()
    {
        let fallback = defaults["quadrants"]
            .as_array()
            .expect("bundled quadrants")
            .iter()
            .find(|entry| entry["key"] == quadrant["key"])
            .unwrap_or(&defaults["quadrants"][index]);
        complete(quadrant, fallback, "Quadrant")?;
        choice(
            &quadrant["key"],
            &["do-first", "schedule", "delegate", "eliminate"],
            "Quadrant key",
        )?;
        if !keys.insert(
            quadrant["key"]
                .as_str()
                .expect("validated string")
                .to_owned(),
        ) {
            return Err("Quadrant keys must be unique.".into());
        }
    }
    if keys.len() != 4 {
        return Err("Provide all four quadrants.".into());
    }
    Ok(())
}

/// Validate and normalize workspace preferences.
pub fn normalize_preferences(value: &mut Value) -> Result<(), String> {
    complete(value, &DEFAULTS["preferences"], "Preferences")?;
    choice(&value["theme"], &["light", "dark", "system"], "Theme")?;
    choice(&value["density"], &["comfortable", "compact"], "Density")?;
    if let Some(id) = value["lastProjectId"].as_str() {
        uuid::Uuid::parse_str(id)
            .map_err(|_| "Last project id must be a UUID.")?;
    }
    if value
        .get("columnTaskLimitMigrated")
        .is_some_and(|flag| !flag.is_boolean())
    {
        return Err("Column task-limit migration flag must be boolean.".into());
    }
    Ok(())
}

/// Validate and normalize saved filters.
pub fn normalize_filter(value: &mut Value) -> Result<(), String> {
    complete(value, &DEFAULTS["filter"], "Saved filter")?;
    for key in ["columnIds", "labelIds", "assigneeIds"] {
        for item in value[key].as_array().expect("validated array") {
            let text =
                item.as_str().ok_or("Saved filter ids must be strings.")?;
            uuid::Uuid::parse_str(text)
                .map_err(|_| "Saved filter ids must be UUIDs.")?;
        }
    }
    unique_numbers(&value["priorities"], 1, 5, "Filter priorities")?;
    choices(
        &value["quadrants"],
        &["do-first", "schedule", "delegate", "eliminate"],
        "Filter quadrants",
    )?;
    for key in ["dueFrom", "dueTo"] {
        if let Some(date) = value[key].as_str() {
            let parsed = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
                .map_err(
                    |_| "Saved filter dates must be real calendar dates.",
                )?;
            if date.len() != 10
                || &date[..4] == "0000"
                || parsed.format("%Y-%m-%d").to_string() != date
            {
                return Err("Saved filter dates must use YYYY-MM-DD.".into());
            }
        }
    }
    if let (Some(start), Some(end)) =
        (value["dueFrom"].as_str(), value["dueTo"].as_str())
        && start > end
    {
        return Err("Saved filter ends before it starts.".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn fills_legacy_omissions_without_accepting_malformed_values() {
        let mut settings = json!({"terminology": {"taskPlural": "Cards"}});
        normalize_settings(&mut settings).unwrap();
        assert_eq!(settings["terminology"]["taskPlural"], "Cards");
        assert_eq!(settings["terminology"]["projectPlural"], "Projects");
        for invalid in [
            json!(null),
            json!({"terminology": []}),
            json!({"showWeekends": "yes"}),
            json!({"priorities": []}),
            json!({"quadrants": []}),
            json!({"workingDays": [1, 1]}),
            json!({"cardFields": ["unknown"]}),
            json!({"firstDayOfWeek": 0.5}),
        ] {
            assert!(normalize_settings(&mut invalid.clone()).is_err());
        }
    }

    #[test]
    fn fills_legacy_array_entries_using_their_identity() {
        let mut settings = serde_json::json!({
            "priorities": [{"rank": 5}, {"rank": 4}, {"rank": 3}, {"rank": 2}, {"rank": 1}],
            "quadrants": [{"key": "eliminate"}, {"key": "delegate"}, {"key": "schedule"}, {"key": "do-first"}]
        });
        normalize_settings(&mut settings).unwrap();
        assert_eq!(settings["priorities"][0]["name"], "Critical");
        assert_eq!(settings["priorities"][3]["color"], "#477b78");
        assert_eq!(settings["quadrants"][0]["icon"], "ArchiveX");
        let mut missing_ids =
            serde_json::json!({"priorities": [{}, {}, {}, {}, {}]});
        normalize_settings(&mut missing_ids).unwrap();
        assert_eq!(missing_ids["priorities"][4]["rank"], 5);
    }

    #[test]
    fn validates_preferences_and_filter_shapes_and_dates() {
        let mut preferences = json!({});
        normalize_preferences(&mut preferences).unwrap();
        assert_eq!(preferences["theme"], "system");
        for invalid in [
            json!({"theme": "unknown"}),
            json!({"lastProjectId": []}),
            json!({"columnTaskLimitMigrated": 1}),
        ] {
            assert!(normalize_preferences(&mut invalid.clone()).is_err());
        }
        for invalid in [
            json!({"columnIds": [1]}),
            json!({"labelIds": ["bad-id"]}),
            json!({"dueFrom": "2026-02-30"}),
            json!({"dueFrom": "0000-01-01"}),
            json!({"dueTo": "+10000-01-01"}),
            json!({"priorities": [6]}),
            json!({"quadrants": ["unknown"]}),
            json!({"query": 1}),
        ] {
            assert!(normalize_filter(&mut invalid.clone()).is_err());
        }
        normalize_filter(&mut json!({"dueFrom": "2024-02-29"})).unwrap();
    }
}
