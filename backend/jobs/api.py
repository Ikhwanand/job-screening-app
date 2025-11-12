from ninja_extra import NinjaExtraAPI
from ninja_jwt.controller import AsyncNinjaJWTDefaultController

from .controllers import AuthController, ApplicationController, EvaluationController, JobsController

api = NinjaExtraAPI(
    title="Job Screening API",
    version="1.0.0",
)


api.register_controllers(
    AsyncNinjaJWTDefaultController,
    AuthController,
    ApplicationController,
    EvaluationController,
    JobsController,
)
