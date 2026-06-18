import { Module } from '@nestjs/common';
import { ProjectService } from './project.service';
import { ProjectController, ShareController } from './project.controller';
import { QueueModule } from '../queue/queue.module';
import { BookModule } from '../book/book.module';

@Module({
  imports: [QueueModule, BookModule],
  providers: [ProjectService],
  controllers: [ProjectController, ShareController],
  exports: [ProjectService],
})
export class ProjectModule {}
