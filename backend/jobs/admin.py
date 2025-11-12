from django.contrib import admin
from .models import EvaluationJob, Application, Job, Document
# Register your models here.
admin.site.register(EvaluationJob)
admin.site.register(Application)
admin.site.register(Job)
admin.site.register(Document)