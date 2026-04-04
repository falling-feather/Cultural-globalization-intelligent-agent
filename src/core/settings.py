from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "dev"
    output_dir: str = "storage/outputs"
    default_market: str = "AFRICA"
    use_real_apis: bool = True

    # 文本类模型统一使用 DeepSeek
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com/v1"
    deepseek_model: str = "deepseek-chat"

    # 视频生成模型使用硅基流动 Wan
    siliconflow_api_key: str = ""
    siliconflow_base_url: str = "https://api.siliconflow.cn/v1"
    wan_model: str = "Wan-AI/Wan2.2-I2V-A14B"
    wan_task_type: str = "image-to-video"
    wan_image_size: str = "1280x720"
    wan_image: str = ""
    siliconflow_wan_submit_path: str = "/video/submit"
    siliconflow_wan_query_path: str = "/video/status"
    video_poll_interval_sec: int = 5
    video_poll_timeout_sec: int = 300

    # Auth（管理员密码仅写在 .env，勿提交仓库；首次无用户时用于创建 admin）
    jwt_secret: str = "dev-change-me-use-long-random-string-in-production-32chars"
    jwt_expire_hours: int = 24
    auth_db_path: str = "storage/auth.db"
    admin_username: str = ""
    admin_password: str = ""
    trust_proxy_headers: bool = False

    # 网页抓取（内容总结）
    fetch_max_bytes: int = 2_000_000
    summarize_max_chars: int = 24000

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
