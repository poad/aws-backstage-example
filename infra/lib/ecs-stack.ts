import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import assert from 'assert';

interface EcsStackProps extends cdk.StackProps {
  vpc: cdk.aws_ec2.IVpc;
  targetGroup: cdk.aws_elasticloadbalancingv2.IApplicationTargetGroup;
  dnsName: string;
  ecsSg: cdk.aws_ec2.ISecurityGroup;
  ecsApplicationPort: number;
  ecsHealthCheckConfig?: cdk.aws_elasticloadbalancingv2.HealthCheck;
  ecr: cdk.aws_ecr.Repository;
  secret: cdk.aws_secretsmanager.Secret;
}

export class EcsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: EcsStackProps) {
    super(scope, id, props);

    assert(props, '');
    const appName = this.node.tryGetContext('appName');
    assert(appName, '');
    const ecsConfig = this.node.tryGetContext('ecs');

    const desiredCount = this.node.tryGetContext('desiredCount')
      ? Number.parseInt(this.node.tryGetContext('desiredCount')) : 0;

    const {
      vpc,
      ecsSg,
      ecr,
      dnsName,
      targetGroup,
      ecsApplicationPort,
      ecsHealthCheckConfig,
      secret,
    } = props;

    const executionRole = new cdk.aws_iam.Role(this, 'TaskExecutionRole', {
      roleName: `${appName}-task-execution`,
      assumedBy: new cdk.aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
      inlinePolicies: {
        'secretsmanager-access': new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              resources: [
                `arn:aws:secretsmanager:${this.region}:${this.account}:secret:*`,
              ],
              actions: [
                'secrets:*',
              ],
            }),
          ],
        }),
      },
    });

    const taskDefinition = new cdk.aws_ecs.TaskDefinition(this, 'TaskDefinition', {
      family: `${appName}-task-definition`,
      compatibility: cdk.aws_ecs.Compatibility.EC2_AND_FARGATE,
      cpu: ecsConfig.cpu ?? '256',
      memoryMiB: ecsConfig.memoryMiB ?? '512',
      runtimePlatform: {
        cpuArchitecture: cdk.aws_ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: cdk.aws_ecs.OperatingSystemFamily.LINUX,
      },
      executionRole,
      taskRole: new cdk.aws_iam.Role(this, 'ECSTaskRole', {
        roleName: `${appName}-task`,
        assumedBy: new cdk.aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        inlinePolicies: {
          'log-access-policy': new cdk.aws_iam.PolicyDocument({
            statements: [
              new cdk.aws_iam.PolicyStatement({
                actions: [
                  'logs:CreateLogStream',
                  'logs:PutLogEvents',
                ],
                effect: cdk.aws_iam.Effect.ALLOW,
                resources: ['*'],
              }),
            ],
          }),
          'ecs-policy': new cdk.aws_iam.PolicyDocument({
            statements: [
              new cdk.aws_iam.PolicyStatement({
                actions: [
                  'ecs:*',
                  'ecr:*',
                ],
                effect: cdk.aws_iam.Effect.ALLOW,
                resources: ['*'],
              }),
            ],
          }),
          'secretsmanager-access': new cdk.aws_iam.PolicyDocument({
            statements: [
              new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                resources: [
                  `arn:aws:secretsmanager:${this.region}:${this.account}:secret:*`,
                ],
                actions: [
                  'secrets:*',
                ],
              }),
            ],
          }),
        },
      }),
    });

    const logGroup = new cdk.aws_logs.LogGroup(this, 'LogGroup', {
      logGroupName: appName,
      retention: cdk.aws_logs.RetentionDays.ONE_DAY,
    });

    taskDefinition.addContainer('Container', {
      containerName: appName,
      image: cdk.aws_ecs.ContainerImage.fromEcrRepository(ecr, 'latest'),
      logging: cdk.aws_ecs.LogDriver.awsLogs({
        streamPrefix: `${appName}-`,
        logGroup,
      }),
      environment: {
        BASE_URL: dnsName,
      },
      secrets: {
        POSTGRES_HOST: cdk.aws_ecs.Secret.fromSecretsManager(secret, 'host'),
        POSTGRES_PORT: cdk.aws_ecs.Secret.fromSecretsManager(secret, 'port'),
        POSTGRES_USER: cdk.aws_ecs.Secret.fromSecretsManager(secret, 'username'),
        POSTGRES_PASSWORD: cdk.aws_ecs.Secret.fromSecretsManager(secret, 'password'),
      },
      startTimeout: cdk.Duration.seconds(120),
      portMappings: [
        {
          containerPort: ecsApplicationPort,
          hostPort: ecsApplicationPort,
        },
        ...(ecsHealthCheckConfig?.port ? [
          {
            containerPort: Number.parseInt(ecsHealthCheckConfig.port),
            hostPort: Number.parseInt(ecsHealthCheckConfig.port),
          },
        ]: []),
      ],
    },
    );

    const cluster = new cdk.aws_ecs.Cluster(this, 'Cluster', {
      clusterName: appName,
      vpc,
    });

    const service = new cdk.aws_ecs.FargateService(this, 'Service', {
      serviceName: appName,
      taskDefinition,
      securityGroups: [
        ecsSg,
      ],
      cluster,
      desiredCount,
      minHealthyPercent: 0,
      vpcSubnets: {
        subnetType: cdk.aws_ec2.SubnetType.PUBLIC,
      },
      assignPublicIp: true,
    });
    targetGroup.addTarget(service);
  }
}
