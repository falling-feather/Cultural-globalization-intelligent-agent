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

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
