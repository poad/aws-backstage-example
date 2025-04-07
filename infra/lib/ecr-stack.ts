import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import assert from 'assert';

export class EcrStack extends cdk.Stack {
  public readonly ecr: cdk.aws_ecr.Repository;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const appName = this.node.tryGetContext('appName');
    assert(appName, '');

    const ecrConfig = this.node.tryGetContext('ecr');
    const repositoryName = ecrConfig?.repositoryName ?? appName;

    this.ecr = new cdk.aws_ecr.Repository(this, 'Repository', {
      repositoryName,
      lifecycleRules: [
        {
          tagStatus: cdk.aws_ecr.TagStatus.TAGGED,
          tagPatternList: ['latest'],
          maxImageCount: 1,
          rulePriority: 1,
        },
      ],
    });
  }
}
