import { IsString } from 'class-validator';

export class ChatBootDto {
  @IsString()
  message: string;
}
